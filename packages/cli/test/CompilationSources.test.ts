import { assert, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as CompilationSources from "@confect/cli/CompilationSources";
import * as esbuild from "esbuild";

const services = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
);

const setupCallbacks = Effect.fn("setupCallbacks")(function* (
  plugins: ReadonlyArray<esbuild.Plugin>,
) {
  const onStart = vi.fn<esbuild.PluginBuild["onStart"]>();
  const onLoad = vi.fn<esbuild.PluginBuild["onLoad"]>();
  for (const plugin of plugins)
    yield* Effect.promise(() =>
      Promise.resolve(
        plugin.setup({
          initialOptions: {},
          esbuild,
          onStart,
          onLoad,
          onEnd: vi.fn(),
          onResolve: vi.fn(),
          onDispose: vi.fn(),
          resolve: vi.fn(),
        }),
      ),
    );
  return {
    start: () =>
      Promise.all(
        onStart.mock.calls.map(([callback]) => Promise.resolve(callback())),
      ),
    load: (args: esbuild.OnLoadArgs) => {
      const registration = onLoad.mock.calls.find(
        ([options]) => options.namespace === args.namespace,
      );
      assert(registration !== undefined);
      return Promise.resolve(registration[1](args));
    },
  };
});

describe("CompilationSources", () => {
  it.live(
    "keeps published observations unchanged as builds accumulate inputs",
    () =>
      Effect.gen(function* () {
        let text = "first";
        const sources = yield* CompilationSources.make({
          plugins: [
            {
              name: "virtual",
              setup(build) {
                build.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({
                  contents: text,
                }));
              },
            },
          ],
        });
        const callbacks = yield* setupCallbacks(sources.plugins);
        const args: esbuild.OnLoadArgs = {
          path: "entry",
          namespace: "virtual",
          suffix: "",
          with: {},
          pluginData: undefined,
        };
        const metafile: esbuild.Metafile = {
          inputs: { "virtual:entry": { bytes: 5, imports: [] } },
          outputs: {},
        };
        yield* Effect.promise(() => callbacks.start());
        yield* Effect.promise(() => callbacks.load(args));
        const captured = yield* sources.captured;
        const inputs = yield* sources.inputs(metafile);
        const capturedValue = { ...captured };
        const inputValue = { ...inputs };
        text = "second";
        yield* Effect.promise(() => callbacks.load(args));
        yield* Effect.promise(() =>
          callbacks.load({ ...args, path: "additional" }),
        );
        expect(Object.keys(yield* sources.captured)).toHaveLength(2);
        expect(yield* sources.inputs(metafile)).not.toEqual(inputs);
        expect(captured).toEqual(capturedValue);
        expect(inputs).toEqual(inputValue);
        yield* Effect.promise(() => callbacks.start());
        expect(yield* sources.captured).toEqual({});
        text = "third";
        yield* Effect.promise(() => callbacks.load(args));
        expect(Object.keys(yield* sources.captured)).toHaveLength(1);
        expect(yield* sources.inputs(metafile)).not.toEqual(inputs);
        expect(captured).toEqual(capturedValue);
        expect(inputs).toEqual(inputValue);
      }).pipe(Effect.provide(services)),
  );

  it.live.each(["plugin", "file", "json"] as const)(
    "isolates a late %s observation from a newer build",
    (mode) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const crypto = yield* Crypto.Crypto;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "input.json");
        yield* fs.writeFileString(file, '{"value":1}');
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let firstDigest = true;
        let loads = 0;
        const sources = yield* CompilationSources.make({
          plugins: [
            {
              name: "virtual",
              setup(build) {
                build.onLoad({ filter: /.*/, namespace: "virtual" }, () => {
                  const loaded = { contents: String(++loads) };
                  return loads === 1
                    ? Effect.runPromiseWith(Context.empty())(
                        Deferred.succeed(entered, undefined).pipe(
                          Effect.andThen(Deferred.await(release)),
                          Effect.as(loaded),
                        ),
                      )
                    : loaded;
                });
              },
            },
          ],
        }).pipe(
          Effect.provideService(Crypto.Crypto, {
            ...crypto,
            digest: (algorithm, data) =>
              Effect.gen(function* () {
                if (mode !== "plugin" && firstDigest) {
                  firstDigest = false;
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(release);
                }
                return yield* crypto.digest(algorithm, data);
              }),
          }),
        );
        const callbacks = yield* setupCallbacks(sources.plugins);
        const args: esbuild.OnLoadArgs = {
          path: mode === "plugin" ? "entry" : file,
          namespace: mode === "plugin" ? "virtual" : "file",
          suffix: "",
          with: mode === "json" ? { type: "json" } : {},
          pluginData: undefined,
        };
        yield* Effect.promise(() => callbacks.start());
        const pending = callbacks.load(args);
        yield* Deferred.await(entered);
        yield* Effect.promise(() => callbacks.start());
        expect(yield* sources.captured).toEqual({});
        yield* fs.writeFileString(file, '{"value":2}');
        yield* Effect.promise(() => callbacks.load(args));
        const captured = yield* sources.captured;
        const capturedValue = { ...captured };
        expect(Object.keys(captured)).toHaveLength(1);
        yield* Deferred.succeed(release, undefined);
        yield* Effect.promise(() => pending);
        expect(yield* sources.captured).toEqual(captured);
        expect(captured).toEqual(capturedValue);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.live(
    "observes same-length attributed JSON edits even when native output is identical",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const json = path.join(root, "data.json");
        yield* fs.writeFileString(
          entry,
          'export { default } from "./data.json" with {type:"json"};',
        );
        yield* fs.writeFileString(json, '{"x": 1}');
        const options: esbuild.BuildOptions = {
          entryPoints: [entry],
          absWorkingDir: root,
          bundle: true,
          write: false,
          metafile: true,
          format: "esm",
          logLevel: "silent",
        };
        const sources = yield* CompilationSources.make(options);
        const first = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }),
        );
        const before = yield* sources.inputs(
          first.metafile ?? { inputs: {}, outputs: {} },
        );
        yield* fs.writeFileString(json, '{"x":1 }');
        const second = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }),
        );
        const after = yield* sources.inputs(
          second.metafile ?? { inputs: {}, outputs: {} },
        );
        expect(second.outputFiles?.[0]?.text).toBe(
          first.outputFiles?.[0]?.text,
        );
        expect(after["data.json"]).not.toBe(before["data.json"]);
        const third = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }),
        );
        expect(
          yield* sources.inputs(third.metafile ?? { inputs: {}, outputs: {} }),
        ).toEqual(after);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );
  it.live.each([
    '{"__proto__":{"polluted":true},"constructor":2}',
    "[1,-0,1e400,9007199254740993]",
    '"value"',
    "null",
    "-0",
    "1e400",
  ])("delegates attributed JSON semantics to esbuild for %s", (json) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const entry = path.join(root, "entry.ts");
      yield* fs.writeFileString(path.join(root, "data.json"), json);
      yield* fs.writeFileString(
        entry,
        'export { default } from "./data.json" with { type: "json" }; export const load = () => import("./data.json", { with: { type: "json" } });',
      );
      const options: esbuild.BuildOptions = {
        entryPoints: [entry],
        absWorkingDir: root,
        bundle: true,
        write: false,
        metafile: true,
        format: "esm",
        logLevel: "silent",
      };
      const sources = yield* CompilationSources.make(options);
      const native = yield* Effect.promise(() => esbuild.build(options));
      const captured = yield* Effect.promise(() =>
        esbuild.build({ ...options, plugins: sources.plugins }),
      );
      expect(
        Object.keys(
          yield* sources.inputs(
            captured.metafile ?? { inputs: {}, outputs: {} },
          ),
        ),
      ).toHaveLength(2);
      const load = (result: esbuild.BuildResult) =>
        Effect.promise(
          () =>
            import(
              `data:text/javascript;base64,${Buffer.from(result.outputFiles?.[0]?.text ?? "").toString("base64")}`
            ),
        );
      const nativeModule = yield* load(native);
      const capturedModule = yield* load(captured);
      expect(capturedModule.default).toEqual(nativeModule.default);
      const dynamic = yield* Effect.promise(() => capturedModule.load()).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Record(Schema.String, Schema.Unknown),
          ),
        ),
      );
      expect(Object.keys(dynamic)).toEqual(["default"]);
      expect(dynamic.default).toBe(capturedModule.default);
      if (json.startsWith("{")) {
        expect(Object.getPrototypeOf(capturedModule.default)).toBe(
          Object.prototype,
        );
        expect(Object.hasOwn(capturedModule.default, "__proto__")).toBe(true);
      }
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.live.each(["named-export", "syntax"] as const)(
    "preserves native attributed JSON %s failure",
    (kind) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          path.join(root, "data.json"),
          kind === "syntax" ? '{"x":}' : '{"x":1}',
        );
        yield* fs.writeFileString(
          entry,
          kind === "named-export"
            ? 'import { x } from "./data.json" with {type:"json"}; console.log(x);'
            : 'import data from "./data.json" with {type:"json"}; console.log(data);',
        );
        const options: esbuild.BuildOptions = {
          entryPoints: [entry],
          absWorkingDir: root,
          bundle: true,
          write: false,
          logLevel: "silent",
        };
        const sources = yield* CompilationSources.make(options);
        const native = yield* Effect.promise(() =>
          esbuild.build(options).then(
            () => "success",
            (error: unknown) => String(error),
          ),
        );
        const captured = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }).then(
            () => "success",
            (error: unknown) => String(error),
          ),
        );
        const diagnostic =
          kind === "named-export" ? "No matching export" : "Unexpected";
        expect(native).toContain(diagnostic);
        expect(captured).toContain(diagnostic);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.live(
    "retains native immutable data URLs and separates attributed file identities",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(path.join(root, "data.json"), '{"x":1}');
        yield* fs.writeFileString(
          entry,
          'import a from "./data.json"; import b from "./data.json" with {type:"text"}; import c from "./data.json" with {type:"bytes"}; import d from "data:application/json,%7B%22longNativeURLWhichIsTruncatedInTheMetafile%22%3A1%7D" with {type:"json"}; export default [a,b,c,d];',
        );
        const options: esbuild.BuildOptions = {
          entryPoints: [entry],
          absWorkingDir: root,
          bundle: true,
          write: false,
          metafile: true,
          format: "esm",
          logLevel: "silent",
        };
        const sources = yield* CompilationSources.make(options);
        const captured = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }),
        );
        expect(
          Object.keys(
            yield* sources.inputs(
              captured.metafile ?? { inputs: {}, outputs: {} },
            ),
          ),
        ).toHaveLength(5);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );
  it.live.each(["direct", "symlink", "preserved-symlink"] as const)(
    "rejects %s protected inputs before invoking a loader",
    (mode) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const protectedFile = path.join(directory, ".env.local");
        const alias = path.join(directory, "alias.ts");
        yield* fs.writeFileString(protectedFile, "export default 1;");
        yield* fs.symlink(protectedFile, alias);
        let loads = 0;
        const options: esbuild.BuildOptions = {
          entryPoints: [mode === "direct" ? protectedFile : alias],
          absWorkingDir: directory,
          write: false,
          logLevel: "silent",
          preserveSymlinks: mode === "preserved-symlink",
          plugins: [
            {
              name: "must-not-load",
              setup(build) {
                build.onLoad({ filter: /.*/ }, () => {
                  loads++;
                  return { contents: "export default 2;", loader: "js" };
                });
              },
            },
          ],
        };
        const sources = yield* CompilationSources.make(options);
        yield* Effect.promise(() =>
          esbuild
            .build({ ...options, plugins: sources.plugins })
            .catch(() => undefined),
        );
        expect(loads).toBe(0);
        expect(yield* Effect.flip(sources.ensure)).toMatchObject({
          _tag: "CompilationSourceRejected",
        });
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.live(
    "fails explicitly when a successful graph contains an unobserved input",
    () =>
      Effect.gen(function* () {
        const sources = yield* CompilationSources.make({});
        expect(
          yield* Effect.flip(
            sources.inputs({
              inputs: { "unobserved.ts": { bytes: 5, imports: [] } },
              outputs: {},
            }),
          ),
        ).toMatchObject({
          _tag: "CompilationSourceUnobserved",
          paths: ["unobserved.ts"],
        });
      }).pipe(Effect.provide(services)),
  );

  it.live(
    "observes native defaults and configured loaders without changing their input bytes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const files = {
          plain: "export default 1;",
          "data.json": '{"value":1}',
          "text.txt": "one",
          "custom.data": "two",
          "entry.ts":
            'import a from "./plain"; import b from "./data.json"; import c from "./text.txt"; import d from "./custom.data"; export default [a,b,c,d];',
        };
        yield* Effect.forEach(Object.entries(files), ([file, contents]) =>
          fs.writeFileString(path.join(root, file), contents),
        );
        const options: esbuild.BuildOptions = {
          entryPoints: [path.join(root, "entry.ts")],
          absWorkingDir: root,
          loader: { ".data": "text" },
          bundle: true,
          write: false,
          metafile: true,
        };
        const sources = yield* CompilationSources.make(options);
        const built = yield* Effect.promise(() =>
          esbuild.build({ ...options, plugins: sources.plugins }),
        );
        expect(
          Object.keys(
            yield* sources.inputs(
              built.metafile ?? { inputs: {}, outputs: {} },
            ),
          ).sort(),
        ).toEqual(Object.keys(files).sort());
        expect(Object.keys(yield* sources.captured)).toHaveLength(5);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );
});
