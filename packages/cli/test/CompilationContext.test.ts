import { describe, expect, it } from "@effect/vitest";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Layer from "effect/Layer";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Queue from "effect/Queue";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as CompilationState from "@confect/cli/CompilationState";
import * as CompilationContext from "@confect/cli/CompilationContext";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import type * as esbuild from "esbuild";

const preparedFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const entry = path.join(root, "entry.ts");
  yield* fs.writeFileString(entry, "export default 1;");
  const builds = yield* Ref.make(0);
  const events = yield* Queue.unbounded<CompilationState.Revision>();
  const make = (
    plugins: ReadonlyArray<esbuild.Plugin> = [],
    filesystem = fs,
    mode: CompilationState.Mode = "Watch",
    guards?: Parameters<typeof CompilationContext.make>[4],
    publishFailure?: Parameters<typeof CompilationContext.make>[6],
  ) =>
    CompilationContext.make(
      { id: 1, profile: "modules", roots: [entry] },
      {
        entryPoints: [entry],
        absWorkingDir: root,
        bundle: true,
        format: "esm",
        platform: "node",
        logLevel: "silent",
        plugins: [
          {
            name: "count-builds",
            setup(build) {
              build.onStart(() =>
                Effect.runPromiseWith(Context.empty())(
                  Ref.update(builds, (count) => count + 1),
                ),
              );
            },
          },
          ...plugins,
        ],
      },
      (metafile) => ({
        inputs: Object.fromEntries(
          Object.entries(metafile.inputs).map(([file, metadata]) => [
            path.resolve(root, file),
            {
              ...metadata,
              imports: metadata.imports.map((item) =>
                item.external
                  ? item
                  : { ...item, path: path.resolve(root, item.path) },
              ),
            },
          ]),
        ),
        outputs: Object.fromEntries(
          Object.entries(metafile.outputs).map(([file, metadata]) => [
            path.resolve(root, file),
            {
              ...metadata,
              ...(metadata.entryPoint
                ? { entryPoint: path.resolve(root, metadata.entryPoint) }
                : {}),
            },
          ]),
        ),
      }),
      (event) => Queue.offer(events, event).pipe(Effect.asVoid),
      guards,
      mode,
      publishFailure,
    ).pipe(Effect.provideService(FileSystem.FileSystem, filesystem));
  return { fs, path, root, entry, builds, events, make };
});

describe("CompilationContext", () => {
  it.live(
    "surfaces bounded unsolicited stabilization failure and rejects prior captures",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const generation = yield* Ref.make(0);
        const errors = yield* Queue.unbounded<unknown>();
        let expanding = false;
        const context = yield* fixture.make(
          [
            {
              name: "expanding-watch-inputs",
              setup(build) {
                build.onLoad({ filter: /entry\.ts$/ }, () =>
                  Effect.runPromiseWith(Context.empty())(
                    (expanding
                      ? Ref.update(generation, (value) => value + 1)
                      : Effect.void
                    ).pipe(Effect.as(undefined)),
                  ),
                );
              },
            },
          ],
          fixture.fs,
          "Watch",
          {
            check: Effect.void,
            ensure: Effect.void,
            generation: Ref.get(generation),
          },
          (error) => Queue.offer(errors, error).pipe(Effect.asVoid),
        );
        const initial = yield* context.consume();
        yield* Queue.take(fixture.events);
        expanding = true;
        yield* fixture.fs.writeFileString(fixture.entry, "export default 2;");
        expect(yield* Queue.take(errors)).toMatchObject({
          cause: { _tag: "CompilationInputsDidNotStabilize", attempts: 8 },
        });
        expect(yield* context.preparedRevision).toEqual(Option.none());
        expect(yield* Queue.poll(fixture.events)).toEqual(Option.none());
        expect(
          (yield* Effect.flip(context.consume(initial.receipt))).cause,
        ).toMatchObject({ _tag: "CompilationInputsDidNotStabilize" });
      }).pipe(
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );
  it.live(
    "never hands off a prepared capture after source observation is rejected",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const context = yield* fixture.make([], fixture.fs, "Once");
        const initial = yield* context.consume();
        yield* fixture.fs.writeFileString(
          fixture.path.join(fixture.root, ".env.local"),
          "export default 2;",
        );
        yield* fixture.fs.symlink(
          fixture.path.join(fixture.root, ".env.local"),
          fixture.path.join(fixture.root, "alias.ts"),
        );
        yield* fixture.fs.writeFileString(
          fixture.entry,
          'export { default } from "./alias";',
        );
        expect((yield* Effect.flip(context.consume())).cause).toMatchObject({
          _tag: "CompilationSourceRejected",
        });
        expect(yield* context.preparedRevision).toEqual(Option.none());
        expect(
          (yield* Effect.flip(context.consume(initial.receipt))).cause,
        ).toMatchObject({ _tag: "CompilationSourceRejected" });
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );
  it.live(
    "rebuilds provisional transitive config captures before publishing or preparing them",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const nested = fixture.path.join(fixture.root, "nested");
        yield* fixture.fs.makeDirectory(nested);
        const helper = fixture.path.join(nested, "leaf.ts");
        const config = fixture.path.join(nested, "tsconfig.json");
        yield* fixture.fs.writeFileString(
          fixture.entry,
          'export default require("./nested/leaf");',
        );
        yield* fixture.fs.writeFileString(
          helper,
          "module.exports = { value: 1 };",
        );
        yield* fixture.fs.writeFileString(
          config,
          '{"compilerOptions":{"strict":true}}',
        );
        let edited = false;
        const filesystem = {
          ...fixture.fs,
          realPath: (file: string) =>
            fixture.fs.realPath(file).pipe(
              Effect.tap(() =>
                Effect.gen(function* () {
                  if (file !== helper || edited) return;
                  edited = true;
                  yield* fixture.fs.writeFileString(
                    config,
                    '{"compilerOptions":{"strict":false}}',
                  );
                }),
              ),
            ),
        };
        const guards = yield* CompilationInputs.make("Once").pipe(
          Effect.provideService(FileSystem.FileSystem, filesystem),
        );
        yield* guards.trackSource(fixture.entry);
        const outputs: string[] = [];
        const context = yield* fixture.make(
          [
            {
              name: "capture-native-config-output",
              setup(build) {
                build.onEnd((result) => {
                  outputs.push(result.outputFiles?.[0]?.text ?? "");
                });
              },
            },
          ],
          filesystem,
          "Once",
          guards,
        );
        const snapshot = yield* context.consume();
        expect(outputs).toHaveLength(2);
        expect(outputs[0]).toContain('"use strict";');
        expect(outputs[1]).not.toContain('"use strict";');
        expect(
          yield* fixture.fs.readFileString(
            Object.keys(snapshot.metafile.outputs)[0] ?? "",
          ),
        ).not.toContain('"use strict";');
        expect(yield* context.preparedRevision).toEqual(
          Option.some(snapshot.receipt),
        );
        expect((yield* Queue.take(fixture.events)).revision).toBe(
          snapshot.receipt.revision,
        );
        expect(yield* Queue.poll(fixture.events)).toEqual(Option.none());
        expect(snapshot.receipt.revision).toBe(1);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live(
    "fails explicitly after bounded provisional discovery without publishing revisions",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const generation = yield* Ref.make(0);
        const context = yield* fixture.make(
          [
            {
              name: "continuous-discovery",
              setup(build) {
                build.onLoad({ filter: /entry\.ts$/ }, () =>
                  Effect.runPromiseWith(Context.empty())(
                    Ref.update(generation, (value) => value + 1).pipe(
                      Effect.as(undefined),
                    ),
                  ),
                );
              },
            },
          ],
          fixture.fs,
          "Once",
          {
            check: Effect.void,
            ensure: Effect.void,
            generation: Ref.get(generation),
          },
        );
        expect((yield* Effect.flip(context.consume())).cause).toMatchObject({
          _tag: "CompilationInputsDidNotStabilize",
          attempts: 8,
        });
        expect(yield* Ref.get(fixture.builds)).toBe(8);
        expect(yield* context.preparedRevision).toEqual(Option.none());
        expect(yield* Queue.poll(fixture.events)).toEqual(Option.none());
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );
  it.live(
    "separates same-length input edits from output-only artifact revisions",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        yield* fixture.fs.writeFileString(
          fixture.entry,
          "/*aaaa*/ export default 1;",
        );
        let layout = "first";
        const context = yield* fixture.make(
          [
            {
              name: "output-layout",
              setup(build) {
                build.onEnd((result) => {
                  if (!result.metafile || !result.outputFiles) return;
                  result.outputFiles = result.outputFiles.map((file) => ({
                    ...file,
                    path: file.path.replace(/\.js$/, `-${layout}.js`),
                    contents: new TextEncoder().encode(
                      `${file.text}\n//# sourceMappingURL=${layout}.map`,
                    ),
                  }));
                  result.metafile.outputs = Object.fromEntries(
                    Object.entries(result.metafile.outputs).map(
                      ([file, metadata]) => [
                        file.replace(/\.js$/, `-${layout}.js`),
                        metadata,
                      ],
                    ),
                  );
                });
              },
            },
          ],
          fixture.fs,
          "Once",
        );
        const initial = yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([
          fixture.entry,
        ]);
        yield* fixture.fs.writeFileString(
          fixture.entry,
          "/*bbbb*/ export default 1;",
        );
        const edited = yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([
          fixture.entry,
        ]);
        expect(Object.keys(edited.metafile.outputs)).toEqual(
          Object.keys(initial.metafile.outputs),
        );
        layout = "second";
        const outputOnly = yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([]);
        expect(Object.keys(outputOnly.metafile.outputs)).not.toEqual(
          Object.keys(edited.metafile.outputs),
        );
        for (const file of Object.keys(outputOnly.metafile.outputs)) {
          expect(yield* fixture.fs.exists(file)).toBe(true);
          expect(yield* fixture.fs.readFileString(file)).toContain(
            "sourceMappingURL=second.map",
          );
        }
        const unchanged = yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([]);
        expect(Object.keys(unchanged.metafile.outputs)).toEqual(
          Object.keys(outputOnly.metafile.outputs),
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live.each(["load", "capture"] as const)(
    "does not acknowledge a source edit during %s",
    (stage) =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        yield* fixture.fs.writeFileString(
          fixture.entry,
          "/*aaaa*/ export default 1;",
        );
        let edited = false;
        const edit = Effect.gen(function* () {
          if (edited) return;
          edited = true;
          yield* fixture.fs.writeFileString(
            fixture.entry,
            "/*bbbb*/ export default 1;",
          );
        });
        const filesystem = {
          ...fixture.fs,
          readFile: (file: string) =>
            fixture.fs
              .readFile(file)
              .pipe(
                Effect.tap(() =>
                  file === fixture.entry && stage === "load"
                    ? edit
                    : Effect.void,
                ),
              ),
        };
        const context = yield* fixture.make(
          [
            {
              name: "edit-before-capture",
              setup(build) {
                build.onEnd(() =>
                  Effect.runPromiseWith(Context.empty())(
                    stage === "capture" ? edit : Effect.void,
                  ),
                );
              },
            },
          ],
          filesystem,
          "Once",
        );
        const first = yield* context.consume();
        yield* Queue.take(fixture.events);
        yield* context.consume();
        const pending = yield* Queue.take(fixture.events);
        expect(pending.affectedRoots).toEqual([fixture.entry]);
        expect(CompilationState.acknowledged(pending, [first.receipt])).toBe(
          false,
        );
        yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live(
    "invalidates resolved input graph changes with identical source contents",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        yield* fixture.fs.writeFileString(
          fixture.entry,
          'export { default } from "selected";',
        );
        const left = fixture.path.join(fixture.root, "left.ts");
        const right = fixture.path.join(fixture.root, "right.ts");
        yield* fixture.fs.writeFileString(left, "export default 1;");
        yield* fixture.fs.writeFileString(right, "export default 1;");
        let selected = left;
        const context = yield* fixture.make(
          [
            {
              name: "select-input",
              setup(build) {
                build.onResolve({ filter: /^selected$/ }, () => ({
                  path: selected,
                }));
              },
            },
          ],
          fixture.fs,
          "Once",
        );
        yield* context.consume();
        yield* Queue.take(fixture.events);
        selected = right;
        yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([
          fixture.entry,
        ]);
        yield* context.consume();
        expect((yield* Queue.take(fixture.events)).affectedRoots).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );
  it.live(
    "reuses only a matching prepared revision and never shares scoped artifacts",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const context = yield* fixture.make();
        const first = yield* context.consume();
        expect(yield* context.preparedRevision).toEqual(
          Option.some(first.receipt),
        );
        const before = yield* Ref.get(fixture.builds);
        const copied = yield* Effect.scoped(context.consume(first.receipt));
        const second = yield* Effect.scoped(context.consume(first.receipt));
        expect(yield* Ref.get(fixture.builds)).toBe(before);
        expect(copied.receipt).toEqual(first.receipt);
        expect(Object.keys(copied.metafile.outputs)).not.toEqual(
          Object.keys(second.metafile.outputs),
        );
        for (const file of Object.keys(copied.metafile.outputs))
          expect(yield* fixture.fs.exists(file)).toBe(false);
        const wrongContext = yield* context.consume({
          ...first.receipt,
          context: 2,
        });
        expect(yield* Ref.get(fixture.builds)).toBe(before + 1);
        const wrongRevision = yield* context.consume(first.receipt);
        expect(yield* Ref.get(fixture.builds)).toBe(before + 2);
        expect(wrongRevision.receipt.revision).toBeGreaterThan(
          wrongContext.receipt.revision,
        );
        yield* context.consume();
        expect(yield* Ref.get(fixture.builds)).toBe(before + 3);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live.each(["errors", "missing-metafile"] as const)(
    "does not prepare %s results or reuse the preceding snapshot",
    (mode) =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        let invalid = false;
        const context = yield* fixture.make([
          {
            name: "invalidate-result",
            setup(build) {
              build.onEnd((result) => {
                if (!invalid) return;
                if (mode === "errors")
                  return { errors: [{ text: "injected build failure" }] };
                Reflect.deleteProperty(result, "metafile");
              });
            },
          },
        ]);
        const initial = yield* context.consume();
        invalid = true;
        expect(Result.isFailure(yield* Effect.result(context.consume()))).toBe(
          true,
        );
        expect(yield* context.preparedRevision).toEqual(Option.none());
        const before = yield* Ref.get(fixture.builds);
        expect(
          Result.isFailure(
            yield* Effect.result(context.consume(initial.receipt)),
          ),
        ).toBe(true);
        expect(yield* Ref.get(fixture.builds)).toBe(before + 1);
        invalid = false;
        const recovered = yield* context.consume(initial.receipt);
        expect(yield* Ref.get(fixture.builds)).toBe(before + 2);
        expect(recovered.receipt.revision).toBeGreaterThan(
          initial.receipt.revision,
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live(
    "copies the exact prepared output when a newer native capture arrives during handoff",
    () =>
      Effect.gen(function* () {
        const fixture = yield* preparedFixture;
        const copying = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const paused = yield* Ref.make(false);
        const context = yield* fixture.make([], {
          ...fixture.fs,
          makeTempDirectoryScoped: (options) =>
            fixture.fs.makeTempDirectoryScoped(options).pipe(
              Effect.tap(() =>
                options?.prefix === ".confect-artifacts-"
                  ? Effect.gen(function* () {
                      if (yield* Ref.get(paused)) {
                        yield* Deferred.succeed(copying, undefined);
                        yield* Deferred.await(resume);
                      }
                    })
                  : Effect.void,
              ),
            ),
        });
        const initial = yield* Effect.scoped(context.consume());
        yield* Queue.take(fixture.events);
        const before = yield* Ref.get(fixture.builds);
        yield* Ref.set(paused, true);
        const consuming = yield* context
          .consume(initial.receipt)
          .pipe(Effect.forkScoped);
        yield* Deferred.await(copying);
        expect(yield* Ref.get(fixture.builds)).toBe(before);
        yield* fixture.fs.writeFileString(fixture.entry, "export default 2;");
        const edited = yield* Queue.take(fixture.events);
        yield* Deferred.succeed(resume, undefined);
        const snapshot = yield* Fiber.join(consuming);
        expect(snapshot.receipt).toEqual(initial.receipt);
        expect(edited.revision).toBeGreaterThan(snapshot.receipt.revision);
        expect(CompilationState.acknowledged(edited, [snapshot.receipt])).toBe(
          false,
        );
        expect(
          yield* fixture.fs.readFileString(
            Object.keys(snapshot.metafile.outputs)[0] ?? "",
          ),
        ).toContain("= 1;");
        expect(yield* context.preparedRevision).toEqual(
          Option.some({
            context: edited.context,
            revision: edited.revision,
            roots: edited.roots,
          }),
        );
      }).pipe(
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.live(
    "rejects incomplete native results before publishing readiness and recovers",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, "export default 1;");
        const events = yield* Ref.make<
          ReadonlyArray<CompilationState.Revision>
        >([]);
        let incomplete = true;
        const context = yield* CompilationContext.make(
          { id: 1, profile: "modules", roots: [entry] },
          {
            entryPoints: [entry],
            absWorkingDir: root,
            bundle: true,
            format: "esm",
            platform: "node",
            logLevel: "silent",
            plugins: [
              {
                name: "incomplete-result",
                setup(build) {
                  build.onEnd((result) => {
                    if (incomplete) Reflect.deleteProperty(result, "metafile");
                  });
                },
              },
            ],
          },
          (metafile) => metafile,
          (revision) => Ref.update(events, (current) => [...current, revision]),
        );
        const failure = yield* Effect.flip(context.consume());
        expect(String(failure.cause)).toContain(
          "esbuild completed without metafile",
        );
        expect(yield* Ref.get(events)).toEqual([]);
        incomplete = false;
        yield* fs.writeFileString(entry, "export default 2;");
        const snapshot = yield* context.consume();
        expect(snapshot.metafile.outputs).not.toEqual({});
        expect(yield* Ref.get(events)).not.toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );

  it.effect(
    "relocates the output graph without changing input identities or the original metafile",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const metafile: esbuild.Metafile = {
          inputs: { "/source/entry.ts": { bytes: 1, imports: [] } },
          outputs: {
            "/context/entry.mjs": {
              bytes: 2,
              inputs: {},
              exports: [],
              entryPoint: "/source/entry.ts",
              imports: [
                { path: "/context/chunk.mjs", kind: "import-statement" },
                { path: "package", kind: "import-statement", external: true },
              ],
            },
            "/context/chunk.mjs": {
              bytes: 3,
              inputs: {},
              exports: [],
              imports: [],
            },
          },
        };
        const relocated = CompilationContext.relocateMetafile(
          metafile,
          "/context",
          "/session",
          path,
        );
        expect(relocated.inputs).toBe(metafile.inputs);
        expect(
          relocated.outputs["/session/entry.mjs"]?.imports.map(
            (item) => item.path,
          ),
        ).toEqual(["/session/chunk.mjs", "package"]);
        expect(relocated.outputs["/session/entry.mjs"]?.entryPoint).toBe(
          "/source/entry.ts",
        );
        expect(metafile.outputs["/context/entry.mjs"]?.imports[0]?.path).toBe(
          "/context/chunk.mjs",
        );
      }).pipe(Effect.provide(Path.layer)),
  );
  it.live(
    "returns the exact consumed snapshot if a native rebuild replaces the cache before copying",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, "export default 1;");
        const copying = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const pause = yield* Ref.make(true);
        const writes = yield* Ref.make(0);
        const events = yield* Queue.unbounded<CompilationState.Revision>();
        const filesystem = {
          ...fs,
          writeFile: (...args: Parameters<typeof fs.writeFile>) =>
            Ref.update(writes, (count) => count + 1).pipe(
              Effect.andThen(fs.writeFile(...args)),
            ),
          makeTempDirectoryScoped: (
            options: Parameters<typeof fs.makeTempDirectoryScoped>[0],
          ) =>
            fs.makeTempDirectoryScoped(options).pipe(
              Effect.tap(() =>
                Effect.gen(function* () {
                  if (
                    options?.prefix === ".confect-artifacts-" &&
                    (yield* Ref.getAndSet(pause, false))
                  ) {
                    yield* Deferred.succeed(copying, undefined);
                    yield* Deferred.await(resume);
                  }
                }),
              ),
            ),
        };
        const context = yield* CompilationContext.make(
          { id: 1, profile: "modules", roots: [entry] },
          {
            entryPoints: [entry],
            absWorkingDir: root,
            bundle: true,
            format: "esm",
            platform: "node",
            outExtension: { ".js": ".mjs" },
            logLevel: "silent",
          },
          (metafile) => ({
            inputs: Object.fromEntries(
              Object.entries(metafile.inputs).map(([file, value]) => [
                path.resolve(root, file),
                value,
              ]),
            ),
            outputs: Object.fromEntries(
              Object.entries(metafile.outputs).map(([file, value]) => [
                path.resolve(root, file),
                {
                  ...value,
                  ...(value.entryPoint
                    ? { entryPoint: path.resolve(root, value.entryPoint) }
                    : {}),
                },
              ]),
            ),
          }),
          (event) => Queue.offer(events, event).pipe(Effect.asVoid),
        ).pipe(Effect.provideService(FileSystem.FileSystem, filesystem));
        const consuming = yield* context.consume().pipe(Effect.forkScoped);
        yield* Deferred.await(copying);
        const initial = yield* Queue.take(events);
        yield* fs.writeFileString(entry, "export default 2;");
        const changed = yield* Queue.take(events);
        expect(changed.revision).toBeGreaterThan(initial.revision);
        yield* Deferred.succeed(resume, undefined);
        const snapshot = yield* Fiber.join(consuming);
        expect(snapshot.receipt.revision).toBe(initial.revision);
        const output = Object.keys(snapshot.metafile.outputs)[0];
        expect(output).toBeDefined();
        expect(yield* fs.readFileString(output ?? "")).toContain("= 1;");
        const fresh = yield* context.consume();
        expect(
          yield* fs.readFileString(
            Object.keys(fresh.metafile.outputs)[0] ?? "",
          ),
        ).toContain("= 2;");
        const before = yield* Ref.get(writes);
        const unchanged = yield* context.consume();
        expect(Object.keys(unchanged.metafile.outputs)).toEqual(
          Object.keys(fresh.metafile.outputs),
        );
        expect(yield* Ref.get(writes)).toBe(before);
      }).pipe(
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  );
});
