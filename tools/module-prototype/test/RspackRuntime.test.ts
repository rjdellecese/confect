import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { rspack, type Stats } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import * as RspackInputs from "../src/RspackInputs.ts";
import * as RspackRuntime from "../src/RspackRuntime.ts";
import * as Runner from "../src/Runner.ts";

class Failed extends Schema.TaggedError<Failed>()("RspackRuntimeTestFailed", {
  cause: Schema.Unknown,
}) {}

const fixture = Effect.fn("RspackRuntimeTest.fixture")(function* (
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const file = (relative: string) => path.join(root, relative);
  for (const [relative, contents] of Object.entries(files)) {
    yield* fs.makeDirectory(path.dirname(file(relative)), { recursive: true });
    yield* fs.writeFileString(file(relative), contents);
  }
  return { root, file };
});

type RuntimeFailure =
  | RspackRuntime.Unproven
  | RspackInputs.Failed
  | RspackInputs.Changed;

const probe = Effect.fn("RspackRuntimeTest.probe")(function* (
  entry: string,
  options: {
    readonly conditions?: ReadonlyArray<string>;
    readonly alias?: string;
    readonly context?: string;
    readonly deniedBasenames?: ReadonlyArray<string>;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const services = yield* Effect.context<never>();
  const output = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(entry),
    prefix: ".confect-artifacts-runtime-test-",
  });
  const configuration = path.join(output, "tsconfig.json");
  yield* fs.writeFileString(configuration, "{}");
  const recording = RspackInputs.make({
    deniedBasenames: options.deniedBasenames ?? [],
  });
  let guard: RspackInputs.Failed | RspackInputs.Changed | undefined;
  const note = (cause: unknown) => {
    if (
      Schema.is(RspackInputs.Changed)(cause) ||
      (Schema.is(RspackInputs.Failed)(cause) && cause.code !== "ENOENT")
    )
      guard ??= cause;
  };
  const wrap = <F extends (...args: never[]) => unknown>(operation: F): F =>
    new Proxy(operation, {
      apply(target, receiver, args: unknown[]) {
        const callback = args.at(-1);
        assert(typeof callback === "function");
        return Reflect.apply(target, receiver, [
          ...args.slice(0, -1),
          (cause: unknown, value: unknown) => {
            note(cause);
            callback(cause, value);
          },
        ]);
      },
    });
  assert(recording.fileSystem.lstat && recording.fileSystem.realpath);
  const fileSystem = {
    ...recording.fileSystem,
    readFile: wrap(recording.fileSystem.readFile),
    stat: wrap(recording.fileSystem.stat),
    lstat: wrap(recording.fileSystem.lstat),
    readlink: wrap(recording.fileSystem.readlink),
    realpath: wrap(recording.fileSystem.realpath),
    readdir: wrap(recording.fileSystem.readdir),
  };
  const reads: string[] = [];
  const ensure = Effect.suspend(() =>
    guard ? Effect.fail(guard) : Effect.void,
  );
  const readFile = (name: string) =>
    Effect.callback<Uint8Array, RspackInputs.Failed | RspackInputs.Changed>(
      (resume) => {
        reads.push(name);
        fileSystem.readFile(name, (cause, contents) => {
          if (cause) {
            assert(
              Schema.is(RspackInputs.Failed)(cause) ||
                Schema.is(RspackInputs.Changed)(cause),
            );
            resume(Effect.fail(cause));
          } else {
            assert(contents instanceof Uint8Array);
            resume(Effect.succeed(contents));
          }
        });
      },
    );
  const runtime = yield* RspackRuntime.make({
    configuration,
    conditions: options.conditions ?? ["node"],
    readFile,
    ensure,
  });
  const results: Array<{
    request: string;
    result: Result.Result<
      { required: string; imported: string },
      RuntimeFailure
    >;
  }> = [];
  const engine = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          context: path.dirname(entry),
          entry,
          mode: "development",
          target: "node",
          cache: false,
          incremental: false,
          devtool: false,
          experiments: { useInputFileSystem: [/.*/] },
          externalsPresets: { node: false },
          externals: (data) => {
            if (!data.contextInfo?.issuer) return Promise.resolve(undefined);
            return Effect.runPromiseWith(services)(
              Effect.gen(function* () {
                const result = yield* runtime
                  .resolve(
                    options.context
                      ? { ...data, context: options.context }
                      : data,
                  )
                  .pipe(Effect.result);
                results.push({ request: data.request ?? "", result });
                return Result.isSuccess(result)
                  ? `${data.dependencyType === "commonjs" ? "node-commonjs" : "module-import"} ${data.dependencyType === "commonjs" ? result.success.required : pathToFileURL(result.success.imported).href}`
                  : "module-import node:path";
              }),
            );
          },
          module: {
            rules: [
              {
                test: /\.[cm]?js$/,
                type: "javascript/auto",
                resolve: { fullySpecified: false },
              },
            ],
          },
          resolve: {
            ...(options.alias ? { alias: { dependency: options.alias } } : {}),
            extensions: [".js", ".cjs", ".mjs"],
            mainFields: ["main"],
            conditionNames: ["node"],
            byDependency: {
              esm: { conditionNames: ["import", "node"] },
              commonjs: { conditionNames: ["require", "node"] },
            },
          },
          optimization: { minimize: false, nodeEnv: false },
          output: {
            path: output,
            filename: "entry.mjs",
            module: true,
            library: { type: "module" },
          },
        }),
      catch: (cause) => new Failed({ cause }),
    }),
    (compiler) =>
      Effect.callback<void, Failed>((resume) =>
        compiler.close((cause) =>
          resume(cause ? Effect.fail(new Failed({ cause })) : Effect.void),
        ),
      ).pipe(Effect.orDie),
  );
  engine.inputFileSystem = fileSystem;
  const completed = yield* Effect.callback<Stats, Failed>((resume) =>
    engine.run((cause, stats) =>
      resume(
        cause || !stats
          ? Effect.fail(new Failed({ cause }))
          : Effect.succeed(stats),
      ),
    ),
  );
  expect(completed.hasErrors()).toBe(false);
  const capture = yield* recording.capture.pipe(Effect.result);
  return {
    results,
    reads,
    capture,
    url: pathToFileURL(path.join(output, "entry.mjs")).href,
  };
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "RspackRuntime",
  (it) => {
    it.effect(
      "admits exact conditional exports and ignores bundler aliases and loader context",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import imported from "dependency"; const required=require("dependency"); export const probe=[imported,required];',
            "node_modules/dependency/package.json":
              '{"name":"dependency","exports":{"import":{"custom":"./custom.js","default":"./import.js"},"require":"./require.js"}}',
            "node_modules/dependency/custom.js": 'module.exports="custom";',
            "node_modules/dependency/import.js": 'module.exports="import";',
            "node_modules/dependency/require.js": 'module.exports="require";',
            "node_modules/alias/package.json": '{"exports":"./index.js"}',
            "node_modules/alias/index.js": 'module.exports="alias";',
            "other/node_modules/dependency/package.json":
              '{"exports":"./index.js"}',
            "other/node_modules/dependency/index.js":
              'module.exports="wrong context";',
          });
          const prepared = yield* probe(file("entry.js"), {
            conditions: ["node", "custom"],
            alias: file("node_modules/alias/index.js"),
            context: file("other"),
          });
          expect(prepared.results).toHaveLength(2);
          for (const { result } of prepared.results)
            expect(result).toEqual(
              Result.succeed({
                required: file("node_modules/dependency/require.js"),
                imported: file("node_modules/dependency/custom.js"),
              }),
            );
          expect(
            prepared.reads.filter(
              (name) => name === file("node_modules/dependency/package.json"),
            ),
          ).toHaveLength(1);
          assert(Result.isSuccess(prepared.capture));
          yield* prepared.capture.success.validate;
          expect(
            yield* Runner.evaluateNative({
              _tag: "Native",
              url: prepared.url,
              exportName: "probe",
              invoke: false,
            }),
          ).toEqual(["custom", "require"]);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        name: "legacy",
        metadata: '{"main":"./index.js"}',
        reason: "UnsupportedExports",
      },
      {
        name: "array",
        metadata: '{"exports":["./index.js"]}',
        reason: "UnsupportedExports",
      },
      {
        name: "null",
        metadata: '{"exports":null}',
        reason: "UnsupportedExports",
      },
      {
        name: "encoded",
        metadata: '{"exports":"./a%20b.js"}',
        reason: "UnsupportedExports",
      },
      {
        name: "query",
        metadata: '{"exports":"./index.js?query"}',
        reason: "UnsupportedExports",
      },
      {
        name: "hash",
        metadata: '{"exports":"./index.js#hash"}',
        reason: "UnsupportedExports",
      },
      {
        name: "backslash",
        metadata: '{"exports":"./nested\\\\index.js"}',
        reason: "UnsupportedExports",
      },
      {
        name: "traversal",
        metadata: '{"exports":"./nested/../index.js"}',
        reason: "UnsupportedExports",
      },
      {
        name: "node_modules",
        metadata: '{"exports":"./node_modules/index.js"}',
        reason: "UnsupportedExports",
      },
      {
        name: "mixed keys",
        metadata: '{"exports":{".":"./index.js","import":"./index.js"}}',
        reason: "UnsupportedExports",
      },
      {
        name: "require only",
        metadata: '{"exports":{"require":"./index.js"}}',
        reason: "NativeResolution",
      },
      {
        name: "import only",
        metadata: '{"exports":{"import":"./index.js"}}',
        reason: "NativeResolution",
      },
      {
        name: "extension inference",
        metadata: '{"exports":"./index"}',
        reason: "NativeResolution",
      },
    ])("rejects $name without raw resolution", (testCase) =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "entry.js": 'import "dependency";',
          "node_modules/dependency/package.json": testCase.metadata,
          "node_modules/dependency/index.js": 'module.exports="value";',
        });
        const prepared = yield* probe(file("entry.js"));
        expect(prepared.results).toHaveLength(1);
        expect(prepared.results[0]?.result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "RspackRuntimeUnproven",
            reason: testCase.reason,
            request: "dependency",
            importer: file("entry.js"),
          },
        });
      }).pipe(Effect.scoped),
    );

    it.effect.each([
      'import "dependency/index.js?query";',
      'import "dependency/index.js#hash";',
      'import "dependency/a%20b.js";',
      'import "dependency/../index.js";',
      'import "dependency//index.js";',
      'import "dependency/\\u0001index.js";',
      'import "dependency\\\\index.js";',
    ])(
      "rejects unsafe request source %s before package metadata acquisition",
      (source) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": source,
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "node_modules/dependency/index.js": 'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "UnsafeRequest" },
          });
          expect(prepared.reads).toEqual([]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "admits a wildcard exports map without selecting its target in JavaScript",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'import "dependency/feature";',
            "node_modules/dependency/package.json":
              '{"exports":{"./*":{"import":"./dist/*.js","require":"./dist/*.js"}}}',
            "node_modules/dependency/dist/feature.js":
              'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toEqual(
            Result.succeed({
              required: file("node_modules/dependency/dist/feature.js"),
              imported: file("node_modules/dependency/dist/feature.js"),
            }),
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "does not let a nested manifest authorize exports extension inference",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":"./nested/index"}',
            "node_modules/dependency/nested/package.json": "{}",
            "node_modules/dependency/nested/index.js":
              'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "NativeResolution" },
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects an exports directory even when its manifest has an exact main",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json": '{"exports":"./nested"}',
            "node_modules/dependency/nested/package.json":
              '{"main":"./index.js"}',
            "node_modules/dependency/nested/index.js":
              'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "NativeResolution" },
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects a nearer manifest-free package that strict resolution skips",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "nested/entry.js": 'import "dependency";',
            "nested/node_modules/dependency/index.js":
              'module.exports="shadow";',
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "node_modules/dependency/index.js": 'module.exports="ancestor";',
          });
          const prepared = yield* probe(file("nested/entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "LegacyDisagreement" },
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects source self-reference before the installed same-name copy can authorize it",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "package.json": '{"name":"dependency","exports":"./local.js"}',
            "entry.js": 'import "dependency";',
            "local.js": 'module.exports="self";',
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "node_modules/dependency/index.js": 'module.exports="installed";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "SelfReference" },
          });
          expect(prepared.reads).toEqual([file("package.json")]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "uses root exports metadata even when the target has a nested manifest",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":"./nested/index.js"}',
            "node_modules/dependency/nested/package.json": "{}",
            "node_modules/dependency/nested/index.js":
              'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toEqual(
            Result.succeed({
              required: file("node_modules/dependency/nested/index.js"),
              imported: file("node_modules/dependency/nested/index.js"),
            }),
          );
          expect(prepared.reads).toContain(
            file("node_modules/dependency/package.json"),
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves guarded native failures instead of authorizing a raw fallback",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":"./blocked/index.js"}',
            "node_modules/dependency/blocked/index.js":
              'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"), {
            deniedBasenames: ["blocked"],
          });
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "RspackInputsFailed", reason: "ProtectedPath" },
          });
          assert(Result.isFailure(prepared.capture));
          expect(prepared.capture.failure._tag).toBe("RspackInputsFailed");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects a target symlink escaping its canonical package root",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "outside/index.js": 'module.exports="outside";',
          });
          yield* fs.symlink(
            file("outside/index.js"),
            file("node_modules/dependency/index.js"),
          );
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "OutsidePackage" },
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "records failed require-mode discovery before returning Unproven",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js": 'import "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":{"import":"./index.js","require":"./missing.js"}}',
            "node_modules/dependency/index.js": 'module.exports="value";',
          });
          const prepared = yield* probe(file("entry.js"));
          expect(prepared.results[0]?.result).toMatchObject({
            _tag: "Failure",
            failure: { reason: "NativeResolution" },
          });
          assert(Result.isSuccess(prepared.capture));
          expect(prepared.capture.success.observations).toContainEqual(
            expect.objectContaining({
              method: "stat",
              path: file("node_modules/dependency/missing.js"),
              fingerprint: expect.stringContaining("ENOENT"),
            }),
          );
          yield* prepared.capture.success.validate;
          yield* fs.writeFileString(
            file("node_modules/dependency/missing.js"),
            'module.exports="new";',
          );
          const changed = yield* prepared.capture.success.validate.pipe(
            Effect.result,
          );
          assert(Result.isFailure(changed));
          expect(changed.failure._tag).toBe("RspackInputsChanged");
        }).pipe(Effect.scoped),
    );

    it.effect.each(["metadata", "shadow", "symlink"] as const)(
      "invalidates a previously valid receipt after %s changes",
      (change) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "nested/entry.js": 'import "dependency";',
            "node_modules/one/package.json": '{"exports":"./index.js"}',
            "node_modules/one/index.js": 'module.exports="one";',
            "node_modules/one/next.js": 'module.exports="next";',
            "node_modules/two/package.json": '{"exports":"./index.js"}',
            "node_modules/two/index.js": 'module.exports="two";',
          });
          yield* fs.symlink(
            file("node_modules/one"),
            file("node_modules/dependency"),
          );
          const prepared = yield* probe(file("nested/entry.js"));
          expect(prepared.results[0]?.result).toEqual(
            Result.succeed({
              required: file("node_modules/one/index.js"),
              imported: file("node_modules/one/index.js"),
            }),
          );
          assert(Result.isSuccess(prepared.capture));
          yield* prepared.capture.success.validate;
          if (change === "metadata")
            yield* fs.writeFileString(
              file("node_modules/one/package.json"),
              '{"exports":"./next.js"}',
            );
          if (change === "symlink") {
            yield* fs.remove(file("node_modules/dependency"));
            yield* fs.symlink(
              file("node_modules/two"),
              file("node_modules/dependency"),
            );
          }
          if (change === "shadow") {
            yield* fs.makeDirectory(file("nested/node_modules/dependency"), {
              recursive: true,
            });
            yield* fs.writeFileString(
              file("nested/node_modules/dependency/package.json"),
              '{"exports":"./index.js"}',
            );
            yield* fs.writeFileString(
              file("nested/node_modules/dependency/index.js"),
              'module.exports="shadow";',
            );
          }
          const changed = yield* prepared.capture.success.validate.pipe(
            Effect.result,
          );
          assert(Result.isFailure(changed));
          expect(changed.failure._tag).toBe("RspackInputsChanged");
        }).pipe(Effect.scoped),
    );
  },
);
