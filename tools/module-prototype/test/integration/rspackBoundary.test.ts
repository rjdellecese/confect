import { assert, describe, expect, it } from "@effect/vitest";
import { rspack, type Compiler, type Stats } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { createFsFromVolume, Volume } from "memfs";

class NativeFailure extends Schema.TaggedError<NativeFailure>()(
  "RspackBoundaryFailure",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

class PolicyDenied extends Schema.TaggedError<PolicyDenied>()(
  "RspackBoundaryPolicyDenied",
  { path: Schema.String, code: Schema.Literal("EACCES") },
) {}

interface Observation {
  readonly operation: string;
  readonly path: string;
  readonly error: unknown;
  readonly value: unknown;
}

const root = "/rspack-boundary";
const entry = `${root}/entry.js`;
const dependency = `${root}/dependency.js`;

const fixture = Effect.fn("RspackBoundary.fixture")(function* (
  files: Readonly<Record<string, string>>,
  options: {
    readonly cache?: boolean;
    readonly incremental?: boolean;
    readonly blocked?: string;
    readonly afterRead?: (path: string, bytes: string, volume: Volume) => void;
  } = {},
) {
  const volume = Volume.fromJSON(files, root);
  const fs = createFsFromVolume(volume);
  const output = createFsFromVolume(new Volume());
  const observations: Observation[] = [];
  const underlyingReads: string[] = [];
  const denied: PolicyDenied[] = [];
  const input = new Proxy(fs, {
    get(target, property) {
      const method = Reflect.get(target, property);
      if (
        typeof method !== "function" ||
        typeof property !== "string" ||
        ![
          "readFile",
          "stat",
          "lstat",
          "readdir",
          "readlink",
          "realpath",
        ].includes(property)
      )
        return method;
      return new Proxy(method, {
        apply(invoke, _receiver, args) {
          const path = String(args[0]);
          const callback = args.at(-1);
          assert(typeof callback === "function");
          if (property === "readFile") {
            if (options.blocked === path) {
              const error = new PolicyDenied({ path, code: "EACCES" });
              denied.push(error);
              callback(error);
              return;
            }
            underlyingReads.push(path);
          }
          const observed = new Proxy(callback, {
            apply(deliver, receiver, results) {
              const [error, value] = results;
              const captured = Buffer.isBuffer(value)
                ? value.toString("utf8")
                : value;
              observations.push({
                operation: property,
                path,
                error,
                value: captured,
              });
              if (
                property === "readFile" &&
                !error &&
                typeof captured === "string"
              ) {
                options.afterRead?.(path, captured, volume);
              }
              return Reflect.apply(deliver, receiver, results);
            },
          });
          return Reflect.apply(invoke, target, [
            ...args.slice(0, -1),
            observed,
          ]);
        },
      });
    },
  });
  const compiler = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          mode: "development",
          context: root,
          entry,
          target: "node",
          devtool: false,
          cache: options.cache ?? false,
          ...(options.incremental === undefined
            ? {}
            : { incremental: options.incremental }),
          experiments: { useInputFileSystem: [/.*/] },
          resolve: { extensions: [".ts", ".js"], symlinks: true },
          output: {
            path: "/rspack-output",
            filename: "bundle.cjs",
            library: { type: "commonjs2" },
          },
          optimization: { minimize: false, concatenateModules: false },
        }),
      catch: (cause) => new NativeFailure({ operation: "create", cause }),
    }),
    (engine) =>
      Effect.callback<void, NativeFailure>((resume) => {
        engine.close((error) =>
          resume(
            error
              ? Effect.fail(
                  new NativeFailure({ operation: "close", cause: error }),
                )
              : Effect.void,
          ),
        );
      }).pipe(Effect.orDie),
  );
  compiler.inputFileSystem = {
    readFile: (...args: unknown[]) =>
      Reflect.apply(input.readFile, input, args),
    readlink: (...args: unknown[]) =>
      Reflect.apply(input.readlink, input, args),
    readdir: (...args: unknown[]) => Reflect.apply(input.readdir, input, args),
    stat: (...args: unknown[]) =>
      Reflect.apply(input.stat.bind(input), input, args),
    lstat: (...args: unknown[]) =>
      Reflect.apply(input.lstat.bind(input), input, args),
    realpath: (...args: unknown[]) =>
      Reflect.apply(input.realpath, input, args),
  };
  compiler.outputFileSystem = {
    writeFile: (...args) => Reflect.apply(output.writeFile, output, args),
    mkdir: (...args) => Reflect.apply(output.mkdir, output, args),
    readdir: (...args) => Reflect.apply(output.readdir, output, args),
    rmdir: (...args) => Reflect.apply(output.rmdir, output, args),
    unlink: (...args) => Reflect.apply(output.unlink, output, args),
    stat: (...args) => Reflect.apply(output.stat.bind(output), output, args),
    readFile: (...args) => Reflect.apply(output.readFile, output, args),
    chmod: (...args) => Reflect.apply(output.chmod, output, args),
  };
  const run = (changes?: Parameters<Compiler["run"]>[1]) =>
    Effect.callback<Stats, NativeFailure>((resume) => {
      compiler.run((error, stats) => {
        if (error)
          resume(
            Effect.fail(new NativeFailure({ operation: "run", cause: error })),
          );
        else if (!stats)
          resume(
            Effect.fail(
              new NativeFailure({
                operation: "stats",
                cause: "No stats returned",
              }),
            ),
          );
        else if (stats.hasErrors())
          resume(
            Effect.fail(
              new NativeFailure({
                operation: "compile",
                cause: stats.toJson({ all: false, errors: true }).errors,
              }),
            ),
          );
        else resume(Effect.succeed(stats));
      }, changes);
    });
  return {
    volume,
    observations,
    underlyingReads,
    denied,
    run,
    code: () => output.readFileSync("/rspack-output/bundle.cjs", "utf8"),
  };
});

const sources = (stats: Stats) =>
  new Map(
    [...stats.compilation.modules].map((module) => [
      module.identifier(),
      module.originalSource()?.source().toString(),
    ]),
  );

describe("Rspack 2.2.9 public filesystem and incremental boundary", () => {
  it.effect(
    "routes source, package, missing candidate, context and realpath observations through the supplied filesystem",
    () =>
      Effect.gen(function* () {
        const probe = yield* fixture({
          "entry.js":
            'import value from "fixture-package"; import choice from "./choice"; import linked from "./alias.js"; const parts = require.context("./parts", false, /\\.js$/); export const result = [value, choice, linked, parts.keys()];',
          "choice.js": 'export default "javascript-choice";',
          "target.js": 'export default "symlink-target";',
          "parts/one.js": 'export default "context-one";',
          "node_modules/fixture-package/package.json": '{"main":"./one.js"}',
          "node_modules/fixture-package/one.js":
            'export default "package-one";',
        });
        probe.volume.symlinkSync(`${root}/target.js`, `${root}/alias.js`);
        const built = yield* probe.run();
        expect(probe.underlyingReads).toEqual(
          expect.arrayContaining([
            entry,
            `${root}/node_modules/fixture-package/package.json`,
            `${root}/node_modules/fixture-package/one.js`,
            `${root}/target.js`,
          ]),
        );
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "stat",
              path: `${root}/choice.ts`,
              error: expect.objectContaining({ code: "ENOENT" }),
            }),
            expect.objectContaining({
              operation: "readdir",
              path: `${root}/parts`,
              value: expect.arrayContaining(["one.js"]),
            }),
            expect.objectContaining({
              operation: "realpath",
              path: `${root}/alias.js`,
              value: `${root}/target.js`,
            }),
          ]),
        );
        expect([...built.compilation.fileDependencies]).toContain(entry);
        expect([...built.compilation.contextDependencies]).toContain(
          `${root}/parts`,
        );
        expect([...built.compilation.missingDependencies]).toContain(
          `${root}/choice.ts`,
        );
        expect(probe.code()).toContain("package-one");
        expect(probe.code()).toContain("symlink-target");
        expect(probe.code()).toContain("./one.js");
      }).pipe(Effect.scoped),
  );

  it.effect.each([false, true])(
    "retains modules without fresh source reads and does not discover edits without modifiedFiles (cache: %s)",
    (cache) =>
      Effect.gen(function* () {
        const original = 'export default "original-byte-value";';
        const changed = 'export default "changed-source-value";';
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": original,
          },
          cache ? { cache, incremental: true } : { cache },
        );
        const first = yield* probe.run();
        expect(sources(first).get(dependency)).toBe(original);
        expect(probe.underlyingReads).toContain(dependency);
        const before = probe.underlyingReads.length;
        const warm = yield* probe.run();
        expect(sources(warm).get(dependency)).toBe(original);
        expect([...warm.compilation.fileDependencies]).toContain(dependency);
        expect(probe.underlyingReads.slice(before)).not.toContain(dependency);
        probe.volume.writeFileSync(dependency, changed);
        const stale = yield* probe.run();
        expect(sources(stale).get(dependency)).toBe(original);
        expect(probe.code()).toContain("original-byte-value");
        expect(probe.code()).not.toContain("changed-source-value");
        const refreshed = yield* probe.run({
          modifiedFiles: new Set([dependency]),
        });
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("changed-source-value");
        probe.volume.writeFileSync(dependency, "export default ;");
        const failed = yield* probe
          .run({ modifiedFiles: new Set([dependency]) })
          .pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure._tag).toBe("RspackBoundaryFailure");
        probe.volume.writeFileSync(dependency, original);
        expect(
          sources(
            yield* probe.run({ modifiedFiles: new Set([dependency]) }),
          ).get(dependency),
        ).toBe(original);
      }).pipe(Effect.scoped),
  );
  it.effect(
    "rereads source bytes without changed paths when both cache and incremental reuse are disabled",
    () =>
      Effect.gen(function* () {
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": 'export default "original-source";',
          },
          { cache: false, incremental: false },
        );
        yield* probe.run();
        const before = probe.underlyingReads.length;
        const changed = 'export default "refreshed-source";';
        probe.volume.writeFileSync(dependency, changed);
        const refreshed = yield* probe.run();
        expect(probe.underlyingReads.slice(before)).toContain(dependency);
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("refreshed-source");
        expect(probe.code()).not.toContain("original-source");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "honors explicit invalidation of same-metadata package changes, new shadow candidates, context members and symlink retargets",
    () =>
      Effect.gen(function* () {
        const manifest = `${root}/node_modules/fixture-package/package.json`;
        const shadow = `${root}/choice.ts`;
        const member = `${root}/parts/two.js`;
        const alias = `${root}/alias.js`;
        const probe = yield* fixture({
          "entry.js":
            'import value from "fixture-package"; import choice from "./choice"; import linked from "./alias.js"; const parts = require.context("./parts", false, /\\.js$/); export const result = [value, choice, linked, parts.keys()];',
          "choice.js": 'export default "javascript-choice";',
          "link-one.js": 'export default "link-one";',
          "link-two.js": 'export default "link-two";',
          "parts/one.js": 'export default "context-one";',
          "node_modules/fixture-package/package.json": '{"main":"./one.js"}',
          "node_modules/fixture-package/one.js":
            'export default "package-one";',
          "node_modules/fixture-package/two.js":
            'export default "package-two";',
        });
        probe.volume.symlinkSync(`${root}/link-one.js`, alias);
        probe.volume.utimesSync(manifest, 1_000_000_000, 1_000_000_000);
        yield* probe.run();
        const before = probe.volume.statSync(manifest);
        probe.volume.writeFileSync(manifest, '{"main":"./two.js"}');
        probe.volume.utimesSync(manifest, 1_000_000_000, 1_000_000_000);
        const after = probe.volume.statSync(manifest);
        expect([after.ino, after.size, after.mtimeMs]).toEqual([
          before.ino,
          before.size,
          before.mtimeMs,
        ]);
        yield* probe.run({ modifiedFiles: new Set([manifest]) });
        expect(probe.code()).toContain("package-two");
        expect(probe.code()).not.toContain("package-one");
        probe.volume.writeFileSync(
          shadow,
          'export default "typescript-shadow";',
        );
        yield* probe.run({ modifiedFiles: new Set([shadow]) });
        expect(probe.code()).toContain("typescript-shadow");
        expect(probe.code()).not.toContain("javascript-choice");
        probe.volume.writeFileSync(member, 'export default "context-two";');
        yield* probe.run({ modifiedFiles: new Set([member]) });
        expect(probe.code()).not.toContain("context-two");
        yield* probe.run({ modifiedFiles: new Set([`${root}/parts`]) });
        expect(probe.code()).toContain("./two.js");
        expect(probe.code()).toContain("context-two");
        probe.volume.unlinkSync(alias);
        probe.volume.symlinkSync(`${root}/link-two.js`, alias);
        yield* probe.run({ modifiedFiles: new Set([alias]) });
        expect(probe.code()).toContain("link-two");
        expect(probe.code()).not.toContain("link-one");
        probe.volume.unlinkSync(shadow);
        probe.volume.unlinkSync(member);
        yield* probe.run({
          modifiedFiles: new Set([`${root}/parts`]),
          removedFiles: new Set([shadow, member]),
        });
        expect(probe.code()).toContain("javascript-choice");
        expect(probe.code()).not.toContain("typescript-shadow");
        expect(probe.code()).not.toContain("context-two");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects an innocuous protected symlink target before its underlying read",
    () =>
      Effect.gen(function* () {
        const blocked = `${root}/blocked.fixture`;
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./alias.js";',
            "blocked.fixture": 'export default "innocuous-policy-fixture";',
          },
          { blocked },
        );
        probe.volume.symlinkSync(blocked, `${root}/alias.js`);
        const outcome = yield* probe.run().pipe(Effect.result);
        assert(Result.isFailure(outcome));
        expect(probe.denied).toEqual([
          new PolicyDenied({ path: blocked, code: "EACCES" }),
        ]);
        expect(probe.underlyingReads).not.toContain(blocked);
        expect(probe.underlyingReads).not.toContain(`${root}/alias.js`);
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "realpath",
              path: `${root}/alias.js`,
              value: blocked,
            }),
          ]),
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "records acquired bytes rather than later filesystem contents when a source changes before its read callback returns",
    () =>
      Effect.gen(function* () {
        const original = 'export default "acquired-original";';
        const changed = 'export default "mutated-after-read";';
        let mutated = false;
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": original,
          },
          {
            afterRead(path, bytes, volume) {
              if (path === dependency && !mutated) {
                expect(bytes).toBe(original);
                mutated = true;
                volume.writeFileSync(dependency, changed);
              }
            },
          },
        );
        const first = yield* probe.run();
        expect(mutated).toBe(true);
        expect(probe.volume.readFileSync(dependency, "utf8")).toBe(changed);
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "readFile",
              path: dependency,
              value: original,
            }),
          ]),
        );
        expect(sources(first).get(dependency)).toBe(original);
        expect(probe.code()).toContain("acquired-original");
        expect(probe.code()).not.toContain("mutated-after-read");
        const refreshed = yield* probe.run({
          modifiedFiles: new Set([dependency]),
        });
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("mutated-after-read");
      }).pipe(Effect.scoped),
  );
});
