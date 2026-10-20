import { afterEach, assert, describe, expect, it } from "@effect/vitest";
import { Compiler } from "@rspack/core";
import { vi } from "vitest";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as RspackCompiler from "../src/RspackCompiler.ts";
import * as Runner from "../src/Runner.ts";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";

const fixture = (files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(root, relative);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, contents);
    }
    return { fs, path, root, entry: path.join(root, "entry.ts") };
  });

const evaluate = (url: string) =>
  Runner.evaluateNative({
    _tag: "Native",
    url,
    exportName: "probe",
    invoke: true,
  });

afterEach(() => vi.restoreAllMocks());

const snapshot = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const expectFresh = Effect.fn("RspackCompiler.test.expectFresh")(function* (
  entry: string,
  output: Effect.Success<ReturnType<typeof RspackCompiler.compileEntries>>,
  expected: unknown,
) {
  const before = snapshot({
    graph: output.graph,
    fingerprints: output.fingerprints,
    observations: output.observations,
  });
  const cold = yield* RspackCompiler.compileEntries([entry]);
  expect.soft(output.graph).toEqual(cold.graph);
  expect(output.fingerprints).toEqual(cold.fingerprints);
  expect(yield* evaluate(output.urls[entry])).toEqual(expected);
  expect(yield* evaluate(cold.urls[entry])).toEqual(expected);
  yield* output.validate;
  yield* cold.validate;
  expect(
    snapshot({
      graph: output.graph,
      fingerprints: output.fingerprints,
      observations: output.observations,
    }),
  ).toBe(before);
});

describe("Rspack bounded warm provenance", () => {
  it.effect(
    "retains explicit discovery invalidation for native module lookups",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./choice"; export const probe = () => value;',
          "choice.js": "export const value = 1;",
        });
        const run = vi.spyOn(Compiler.prototype, "run");
        const engine = yield* RspackCompiler.make([entry]);
        const original = yield* engine.compile();
        yield* fs.writeFileString(
          path.join(root, "choice.ts"),
          "export const value = 2;",
        );
        const next = yield* engine.compile();
        expect(run).toHaveBeenCalledTimes(2);
        expect(run.mock.instances[1]).toBe(run.mock.instances[0]);
        yield* expectFresh(entry, next, 2);
        expect(yield* evaluate(original.urls[entry])).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects acquisition that would relabel cached state after preflight",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./shared"; export const probe = () => value;',
          "shared.ts": "export const value = 1;",
        });
        const source = path.join(root, "shared.ts");
        const engine = yield* RspackCompiler.make([entry]);
        const original = yield* engine.compile();
        yield* fs.writeFileString(
          entry,
          'import { value } from "./shared"; export const probe = () => value; // edit',
        );
        const context = yield* Effect.context<never>();
        const spy = vi.spyOn(Compiler.prototype, "run");
        spy.mockImplementationOnce(function (
          this: Compiler,
          callback,
          options,
        ) {
          const input = this.inputFileSystem;
          assert(input !== null);
          this.hooks.beforeRun.tapPromise(
            "confect:test-cached-acquisition-race",
            () =>
              Effect.runPromiseWith(context)(
                Effect.gen(function* () {
                  yield* fs.writeFileString(source, "export const value = 2;");
                  for (const method of ["stat", "lstat", "readFile"] as const) {
                    const operation:
                      | ((
                          name: string,
                          callback: (
                            cause: NodeJS.ErrnoException | null,
                            value?: unknown,
                          ) => void,
                        ) => void)
                      | undefined = input[method];
                    assert(operation !== undefined);
                    yield* Effect.callback<void, RspackCompiler.Failed>(
                      (resume) => {
                        operation(source, (cause: unknown) =>
                          resume(
                            cause
                              ? Effect.fail(
                                  new RspackCompiler.Failed({
                                    stage: "test-reread",
                                    path: source,
                                    cause,
                                  }),
                                )
                              : Effect.void,
                          ),
                        );
                      },
                    );
                  }
                }),
              ),
          );
          spy.mockRestore();
          this.run(callback, options);
        });
        const raced = yield* engine.compile().pipe(Effect.result);
        if (Result.isSuccess(raced))
          expect(yield* evaluate(raced.success.urls[entry])).toBe(2);
        expect(Result.isFailure(raced)).toBe(true);
        if (Result.isFailure(raced))
          expect(raced.failure).toMatchObject({
            _tag: "RspackInputsChanged",
            path: source,
          });
        yield* expectFresh(entry, yield* engine.compile(), 2);
        expect(yield* evaluate(original.urls[entry])).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "detects same-size restored-mtime edits without mutating prior receipts",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./shared"; export const probe = () => value;',
          "shared.ts": 'export const value = "one";',
        });
        const source = path.join(root, "shared.ts");
        yield* fs.utimes(source, 1_000_000_000, 1_000_000_000);
        const engine = yield* RspackCompiler.make([entry]);
        const first = yield* engine.compile();
        const observations = snapshot(first.observations);
        const graph = snapshot(first.graph);
        const fingerprints = snapshot(first.fingerprints);
        const code = yield* fs.readFileString(fileURLToPath(first.urls[entry]));
        const before = yield* fs.stat(source);
        assert(Option.isSome(before.atime));
        assert(Option.isSome(before.mtime));
        yield* fs.writeFileString(source, 'export const value = "two";');
        yield* fs.utimes(source, before.atime.value, before.mtime.value);
        const after = yield* fs.stat(source);
        expect([after.ino, after.size, after.mtime]).toEqual([
          before.ino,
          before.size,
          before.mtime,
        ]);
        const second = yield* engine.compile();
        yield* expectFresh(entry, second, "two");
        expect(second.fingerprints[entry]).not.toBe(first.fingerprints[entry]);
        expect(yield* evaluate(first.urls[entry])).toBe("one");
        expect(yield* first.validate.pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackInputsChanged" },
        });
        expect(snapshot(first.observations)).toBe(observations);
        expect(snapshot(first.graph)).toBe(graph);
        expect(snapshot(first.fingerprints)).toBe(fingerprints);
        expect(yield* fs.readFileString(fileURLToPath(first.urls[entry]))).toBe(
          code,
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "recovers missing imports and preserves failed and successful evidence",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./missing"; export const probe = () => value;',
        });
        const source = path.join(root, "missing.ts");
        const engine = yield* RspackCompiler.make([entry]);
        const failed = yield* engine.compile().pipe(Effect.result);
        assert(Result.isFailure(failed));
        assert(Schema.is(RspackCompiler.Failed)(failed.failure));
        expect(failed.failure.stage).toBe("build");
        const missingEvidence = snapshot(failed.failure.observations);
        expect(failed.failure.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ method: "stat", path: source }),
          ]),
        );
        yield* fs.writeFileString(source, "export const value = 1;");
        const recovered = yield* engine.compile();
        const observations = snapshot(recovered.observations);
        yield* expectFresh(entry, recovered, 1);
        yield* fs.remove(source);
        expect(yield* engine.compile().pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackPrototypeCompilationFailed", stage: "build" },
        });
        yield* fs.writeFileString(source, "export const value = 2;");
        yield* expectFresh(entry, yield* engine.compile(), 2);
        expect(snapshot(failed.failure.observations)).toBe(missingEvidence);
        expect(snapshot(recovered.observations)).toBe(observations);
        expect(yield* evaluate(recovered.urls[entry])).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("discovers and removes higher-priority extension shadows", () =>
    Effect.gen(function* () {
      const { entry, fs, path, root } = yield* fixture({
        "entry.ts":
          'import { value } from "./choice"; export const probe = () => value;',
        "choice.js": 'export const value = "javascript";',
      });
      const source = path.join(root, "choice.ts");
      const engine = yield* RspackCompiler.make([entry]);
      const first = yield* engine.compile();
      const firstEvidence = snapshot(first.observations);
      expect(first.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "stat", path: source }),
        ]),
      );
      yield* fs.writeFileString(source, 'export const value = "typescript";');
      const shadowed = yield* engine.compile();
      const secondEvidence = snapshot(shadowed.observations);
      yield* expectFresh(entry, shadowed, "typescript");
      yield* fs.remove(source);
      yield* expectFresh(entry, yield* engine.compile(), "javascript");
      expect(snapshot(first.observations)).toBe(firstEvidence);
      expect(snapshot(shadowed.observations)).toBe(secondEvidence);
      expect(yield* evaluate(first.urls[entry])).toBe("javascript");
      expect(yield* evaluate(shadowed.urls[entry])).toBe("typescript");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rebuilds context graphs for added and removed glob members", () =>
    Effect.gen(function* () {
      const { entry, fs, path, root } = yield* fixture({
        "entry.ts":
          'const parts = require.context("./parts", false, /\\.ts$/); export const probe = () => parts.keys().sort().map((key: string) => parts(key).value);',
        "parts/one.ts": "export const value = 1;",
      });
      const source = path.join(root, "parts/two.ts");
      const engine = yield* RspackCompiler.make([entry]);
      const first = yield* engine.compile();
      const firstEvidence = snapshot(first.observations);
      yield* expectFresh(entry, first, [1]);
      yield* fs.writeFileString(source, "export const value = 2;");
      const added = yield* engine.compile();
      const secondEvidence = snapshot(added.observations);
      yield* expectFresh(entry, added, [1, 2]);
      yield* fs.remove(source);
      yield* expectFresh(entry, yield* engine.compile(), [1]);
      expect(snapshot(first.observations)).toBe(firstEvidence);
      expect(snapshot(added.observations)).toBe(secondEvidence);
      expect(yield* evaluate(added.urls[entry])).toEqual([1, 2]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "retargets imported symlinks without changing old artifacts or receipts",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./alias"; export const probe = () => value;',
          "one.ts": "export const value = 1;",
          "two.ts": "export const value = 2;",
        });
        const alias = path.join(root, "alias.ts");
        yield* fs.symlink(path.join(root, "one.ts"), alias);
        const engine = yield* RspackCompiler.make([entry]);
        const first = yield* engine.compile();
        const observations = snapshot(first.observations);
        yield* fs.remove(alias);
        yield* fs.symlink(path.join(root, "two.ts"), alias);
        const second = yield* engine.compile();
        yield* expectFresh(entry, second, 2);
        expect(snapshot(first.observations)).toBe(observations);
        expect(yield* evaluate(first.urls[entry])).toBe(1);
        expect(yield* first.validate.pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackInputsChanged" },
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects an edit after native acquisition and cold-recovers on the next compile",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import { value } from "./shared"; export const probe = () => value;',
          "shared.ts": "export const value = 1;",
        });
        const source = path.join(root, "shared.ts");
        const engine = yield* RspackCompiler.make([entry]);
        const first = yield* engine.compile();
        const observations = snapshot(first.observations);
        yield* fs.writeFileString(source, "export const value = 2;");
        const spy = vi.spyOn(Compiler.prototype, "run");
        let mutated = false;
        const context = yield* Effect.context<never>();
        spy.mockImplementationOnce(function (
          this: Compiler,
          callback,
          options,
        ) {
          this.hooks.done.tapPromise("confect:test-input-race", () =>
            Effect.runPromiseWith(context)(
              fs.writeFileString(source, "export const value = 3;").pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    mutated = true;
                  }),
                ),
              ),
            ),
          );
          spy.mockRestore();
          this.run(callback, options);
        });
        const raced = yield* engine.compile().pipe(Effect.result);
        expect(mutated).toBe(true);
        expect(raced).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackInputsChanged", path: source },
        });
        yield* expectFresh(entry, yield* engine.compile(), 3);
        expect(snapshot(first.observations)).toBe(observations);
        expect(yield* evaluate(first.urls[entry])).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "invalidates a receipt when evaluation edits an acquired input",
    () =>
      Effect.gen(function* () {
        const { entry } = yield* fixture({
          "entry.ts":
            'import { readFileSync, writeFileSync } from "node:fs"; import { value } from "./shared"; export const probe = () => { const source = new URL("./shared.ts", import.meta.url); const next = "export const value = 2;"; if (readFileSync(source, "utf8") !== next) writeFileSync(source, next); return value; };',
          "shared.ts": "export const value = 1;",
        });
        const engine = yield* RspackCompiler.make([entry]);
        const first = yield* engine.compile();
        const observations = snapshot(first.observations);
        expect(yield* evaluate(first.urls[entry])).toBe(1);
        expect(yield* first.validate.pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackInputsChanged" },
        });
        yield* expectFresh(entry, yield* engine.compile(), 2);
        expect(snapshot(first.observations)).toBe(observations);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reuses linking but preserves fresh artifact and evaluation lifetimes",
    () =>
      Effect.gen(function* () {
        const run = vi.spyOn(Compiler.prototype, "run");
        const { entry, fs } = yield* fixture({
          "entry.ts":
            'import { increment } from "./shared"; export const probe = () => increment();',
          "shared.ts": "let value = 0; export const increment = () => ++value;",
        });
        const engine = yield* RspackCompiler.make([entry]);
        const scope = yield* Scope.fork(yield* Scope.Scope, "sequential");
        const first = yield* engine
          .compile()
          .pipe(Effect.provideService(Scope.Scope, scope));
        const second = yield* engine.compile();
        expect(run).toHaveBeenCalledTimes(1);
        expect(second.urls[entry]).not.toBe(first.urls[entry]);
        expect(second.observations).toEqual(first.observations);
        expect(second.fingerprints).toEqual(first.fingerprints);
        expect(yield* evaluate(first.urls[entry])).toBe(1);
        expect(yield* evaluate(second.urls[entry])).toBe(1);
        yield* Scope.close(scope, Exit.void);
        expect(yield* fs.exists(fileURLToPath(first.urls[entry]))).toBe(false);
        expect(yield* fs.exists(fileURLToPath(second.urls[entry]))).toBe(true);
        yield* second.validate;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "invalidates shared source and preserves old immutable output",
    () =>
      Effect.gen(function* () {
        const run = vi.spyOn(Compiler.prototype, "run");
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
        });
        const engine = yield* RspackCompiler.make([entry]);
        const first = yield* engine.compile();
        const original = yield* fs.readFileString(
          fileURLToPath(first.urls[entry]),
        );
        yield* fs.writeFileString(
          path.join(root, "shared.ts"),
          "export const value = 2;",
        );
        const second = yield* engine.compile();
        expect(run).toHaveBeenCalledTimes(2);
        expect(run.mock.instances[1]).toBe(run.mock.instances[0]);
        expect(second.fingerprints[entry]).not.toBe(first.fingerprints[entry]);
        expect(yield* fs.readFileString(fileURLToPath(first.urls[entry]))).toBe(
          original,
        );
        expect(yield* first.validate.pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RspackInputsChanged" },
        });
        yield* second.validate;
        const cold = yield* RspackCompiler.compileEntries([entry]);
        expect(second.graph).toEqual(cold.graph);
        expect(second.fingerprints).toEqual(cold.fingerprints);
        expect(
          yield* fs.readFileString(fileURLToPath(second.urls[entry])),
        ).toBe(yield* fs.readFileString(fileURLToPath(cold.urls[entry])));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "cold-recaptures changed observations absent from warm callbacks",
    () =>
      Effect.gen(function* () {
        const run = vi.spyOn(Compiler.prototype, "run");
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
        });
        const engine = yield* RspackCompiler.make([entry]);
        yield* engine.compile();
        yield* fs.writeFileString(entry, "export const value = 2;");
        yield* fs.remove(path.join(root, "shared.ts"));
        const output = yield* engine.compile();
        expect(run).toHaveBeenCalledTimes(3);
        expect(run.mock.instances[1]).toBe(run.mock.instances[0]);
        expect(run.mock.instances[2]).not.toBe(run.mock.instances[0]);
        expect(
          output.observations.some(
            (item) => item.path === path.join(root, "shared.ts"),
          ),
        ).toBe(false);
        yield* output.validate;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("bounds the lifetime of obsolete unchanged evidence", () =>
    Effect.gen(function* () {
      const run = vi.spyOn(Compiler.prototype, "run");
      const { entry, fs, path, root } = yield* fixture({
        "entry.ts": 'export { value } from "./shared";',
        "shared.ts": "export const value = 1;",
      });
      const engine = yield* RspackCompiler.make([entry]);
      yield* engine.compile();
      let output;
      for (let index = 1; index <= 32; index++) {
        yield* fs.writeFileString(entry, `export const value = ${index};`);
        output = yield* engine.compile().pipe(Effect.scoped);
        if (index === 1)
          expect(
            output.observations.some(
              (item) => item.path === path.join(root, "shared.ts"),
            ),
          ).toBe(true);
      }
      assert(output !== undefined);
      expect(
        output.observations.some(
          (item) => item.path === path.join(root, "shared.ts"),
        ),
      ).toBe(false);
      expect(run.mock.instances[31]).toBe(run.mock.instances[0]);
      expect(run.mock.instances[32]).not.toBe(run.mock.instances[0]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not certify reuse across unobserved external runtime probes",
    () =>
      Effect.gen(function* () {
        const run = vi.spyOn(Compiler.prototype, "run");
        const { entry } = yield* fixture({
          "entry.ts": 'export { value } from "fixture-package";',
          "node_modules/fixture-package/package.json":
            '{"name":"fixture-package","type":"module","exports":"./index.js"}',
          "node_modules/fixture-package/index.js": "export const value = 1;",
        });
        const engine = yield* RspackCompiler.make([entry]);
        expect((yield* engine.compile()).reusable).toBe(false);
        expect((yield* engine.compile()).reusable).toBe(false);
        expect(run).toHaveBeenCalledTimes(2);
        expect(run.mock.instances[1]).not.toBe(run.mock.instances[0]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("discards failed warm state before recovery", () =>
    Effect.gen(function* () {
      const run = vi.spyOn(Compiler.prototype, "run");
      const { entry, fs } = yield* fixture({
        "entry.ts": "export const value = 1;",
      });
      const engine = yield* RspackCompiler.make([entry]);
      yield* engine.compile();
      yield* fs.writeFileString(entry, "export const value = ;");
      expect(
        Result.isFailure(yield* engine.compile().pipe(Effect.result)),
      ).toBe(true);
      yield* fs.writeFileString(entry, "export const value = 2;");
      yield* engine.compile();
      expect(run).toHaveBeenCalledTimes(4);
      expect(run.mock.instances[1]).toBe(run.mock.instances[0]);
      expect(run.mock.instances[2]).not.toBe(run.mock.instances[0]);
      expect(run.mock.instances[3]).not.toBe(run.mock.instances[2]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Rspack cold compiler prototype", () => {
  it.effect(
    "externalizes packages and requires restart after their resolution metadata changes",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import value from "dependency"; export const probe = () => value;',
          "node_modules/dependency/package.json": '{"main":"./one.cjs"}',
          "node_modules/dependency/one.cjs": "module.exports = 1;",
          "node_modules/dependency/two.cjs": "module.exports = 2;",
        });
        const prepared = yield* RspackCompiler.compile(entry);
        expect(yield* evaluate(prepared.url)).toBe(1);
        expect(prepared.reusable).toBe(false);
        expect(prepared.external).toEqual([
          expect.objectContaining({
            importer: entry,
            physical: path.join(root, "node_modules/dependency/one.cjs"),
          }),
        ]);
        yield* fs.writeFileString(
          path.join(root, "node_modules/dependency/package.json"),
          '{"main":"./two.cjs"}',
        );
        const result = yield* prepared.validate.pipe(Effect.result);
        assert(Result.isFailure(result));
        assert(Schema.is(CompilationInputs.RestartRequired)(result.failure));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("preserves physical file scope for a suffixed module", () =>
    Effect.gen(function* () {
      const { entry, path, root } = yield* fixture({
        "entry.ts":
          'import { scope } from "./helper.ts?one"; export const probe = () => scope;',
        "helper.ts":
          "export const scope = [__filename, __dirname, import.meta.url];",
      });
      const prepared = yield* RspackCompiler.compile(entry);
      const helper = path.join(root, "helper.ts");
      expect(yield* evaluate(prepared.url)).toEqual([
        helper,
        root,
        pathToFileURL(helper).href,
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("rejects a missing export before exposing an artifact", () =>
    Effect.gen(function* () {
      const { entry } = yield* fixture({
        "entry.ts":
          'import { missing } from "./helper"; export const probe = missing;',
        "helper.ts": "export const other = 1;",
      });
      const result = yield* RspackCompiler.compile(entry).pipe(Effect.result);
      assert(Result.isFailure(result));
      assert(Schema.is(RspackCompiler.Failed)(result.failure));
      expect(result.failure.stage).toBe("build");
      expect(result.failure.message).toMatch(/missing|export/i);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("retains native module linking and fresh evaluation scopes", () =>
    Effect.gen(function* () {
      const { entry } = yield* fixture({
        "entry.ts":
          'import { increment } from "./helper"; export const probe = () => increment();',
        "helper.ts": "let value = 0; export const increment = () => ++value;",
      });
      const prepared = yield* RspackCompiler.compile(entry);
      expect(yield* evaluate(prepared.url)).toBe(1);
      expect(yield* evaluate(prepared.url)).toBe(1);
      yield* prepared.validate;
      expect(prepared.observations.length).toBeGreaterThan(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "uses the owned flattened configuration without nested rediscovery",
    () =>
      Effect.gen(function* () {
        const { entry } = yield* fixture({
          "tsconfig.json": '{"extends":"./base.json"}',
          "base.json":
            '{"compilerOptions":{"paths":{"@value":["./parent.ts"]}}}',
          "entry.ts":
            'import { value } from "./nested/helper"; export const probe = () => value;',
          "parent.ts": 'export const value = "owned";',
          "nested/tsconfig.json":
            '{"compilerOptions":{"paths":{"@value":["./other.ts"]}}}',
          "nested/other.ts": 'export const value = "rediscovered";',
          "nested/helper.ts": 'export { value } from "@value";',
        });
        const prepared = yield* RspackCompiler.compile(entry);
        expect(yield* evaluate(prepared.url)).toBe("owned");
        yield* prepared.validate;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "invalidates original input bytes even when only a comment changes",
    () =>
      Effect.gen(function* () {
        const { entry, fs } = yield* fixture({
          "entry.ts": "export const probe = () => 1; // first",
        });
        const prepared = yield* RspackCompiler.compile(entry);
        yield* fs.writeFileString(
          entry,
          "export const probe = () => 1; // other",
        );
        const validation = yield* prepared.validate.pipe(Effect.result);
        assert(Result.isFailure(validation));
        expect(yield* evaluate(prepared.url)).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
