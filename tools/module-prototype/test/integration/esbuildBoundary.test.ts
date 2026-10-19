import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import * as CompilationInputs from "../../../../packages/cli/src/CompilationInputs.ts";

class NativeFailure extends Schema.TaggedError<NativeFailure>()(
  "BoundaryNativeFailure",
  {
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {}

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new NativeFailure({ operation, cause }),
  });

const context = Effect.fn("Boundary.context")(function* (root: string) {
  const path = yield* Path.Path;
  let resolve: esbuild.PluginBuild["resolve"] | undefined;
  const counts = { starts: 0, loads: 0, ends: 0, outputs: 0 };
  const requests: esbuild.OnResolveArgs[] = [];
  const native = yield* Effect.acquireRelease(
    call("context", () =>
      esbuild.context({
        absWorkingDir: root,
        entryPoints: [path.join(root, "entry.js")],
        tsconfigRaw: {},
        bundle: true,
        format: "esm",
        platform: "node",
        write: false,
        metafile: true,
        logLevel: "silent",
        plugins: [
          {
            name: "observe-boundaries",
            setup(build) {
              resolve = (specifier, options) =>
                build.resolve(specifier, options);
              build.onStart(() => {
                counts.starts++;
              });
              build.onLoad({ filter: /.*/ }, () => {
                counts.loads++;
                return undefined;
              });
              build.onResolve({ filter: /.*/ }, (args) => {
                requests.push(args);
                return undefined;
              });
              build.onEnd((result) => {
                counts.ends++;
                counts.outputs += result.outputFiles?.length ?? 0;
              });
            },
          },
        ],
      }),
    ),
    (value) => Effect.promise(() => value.dispose()),
  );
  return {
    counts,
    requests,
    rebuild: call("rebuild", () => native.rebuild()),
    resolve: (specifier: string, options: esbuild.ResolveOptions = {}) => {
      const active = resolve;
      return active
        ? call("resolve", () =>
            active(specifier, {
              importer: path.join(root, "entry.js"),
              resolveDir: root,
              namespace: "file",
              kind: "import-statement",
              ...options,
            }),
          )
        : Effect.fail(
            new NativeFailure({
              operation: "resolve",
              cause: "Plugin setup did not supply a resolver",
            }),
          );
    },
  };
});

describe("esbuild public validation boundary", () => {
  it.effect(
    "resolves outside a build without loading or generating, but does not validate source syntax",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const dependency = path.join(root, "dependency.js");
        yield* fs.writeFileString(
          path.join(root, "entry.js"),
          'export { value } from "./dependency";',
        );
        yield* fs.writeFileString(dependency, "export const value = 1;");
        const probe = yield* context(root);
        expect((yield* probe.resolve("./dependency")).path).toBe(dependency);
        expect(probe.counts).toEqual({
          starts: 0,
          loads: 0,
          ends: 0,
          outputs: 0,
        });
        const built = yield* probe.rebuild;
        expect(built.outputFiles?.length).toBeGreaterThan(0);
        const before = { ...probe.counts };
        yield* fs.writeFileString(dependency, "export const value = ;");
        const resolved = yield* probe.resolve("./dependency");
        expect(resolved.errors).toEqual([]);
        expect(resolved.path).toBe(dependency);
        expect(probe.counts).toEqual(before);
        expect(Result.isFailure(yield* probe.rebuild.pipe(Effect.result))).toBe(
          true,
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "sees missing candidates, shadowing files and symlink retargets without watcher events",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const js = path.join(root, "dependency.js");
        const ts = path.join(root, "dependency.ts");
        const alias = path.join(root, "alias.js");
        yield* fs.writeFileString(path.join(root, "entry.js"), "export {};");
        const probe = yield* context(root);
        expect(
          (yield* probe.resolve("./dependency")).errors.length,
        ).toBeGreaterThan(0);
        yield* fs.writeFileString(js, "export default 1;");
        expect((yield* probe.resolve("./dependency")).path).toBe(js);
        yield* fs.writeFileString(ts, "export default 2;");
        expect((yield* probe.resolve("./dependency")).path).toBe(ts);
        yield* fs.symlink(js, alias);
        expect((yield* probe.resolve("./alias.js")).path).toBe(js);
        yield* fs.remove(alias);
        yield* fs.symlink(ts, alias);
        expect((yield* probe.resolve("./alias.js")).path).toBe(ts);
        yield* fs.remove(ts);
        expect((yield* probe.resolve("./dependency")).path).toBe(js);
        expect(probe.counts).toEqual({
          starts: 0,
          loads: 0,
          ends: 0,
          outputs: 0,
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requires the original attributes and suffix alongside the resolved path",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(root, "entry.js"), "export {};");
        yield* fs.writeFileString(path.join(root, "value.json"), '{"value":1}');
        const probe = yield* context(root);
        const json = yield* probe.resolve("./value.json", {
          with: { type: "json" },
        });
        const text = yield* probe.resolve("./value.json", {
          with: { type: "text" },
        });
        expect(json.errors).toEqual([]);
        expect(text.errors).toEqual([]);
        expect([json.path, json.namespace, json.suffix]).toEqual([
          text.path,
          text.namespace,
          text.suffix,
        ]);
        expect(probe.requests.map((request) => request.with)).toEqual([
          { type: "json" },
          { type: "text" },
        ]);
        const suffixed = yield* probe.resolve("./value.json?variant");
        expect(suffixed.path).toBe(json.path);
        expect(suffixed.suffix).toBe("?variant");
        expect(probe.counts).toEqual({
          starts: 0,
          loads: 0,
          ends: 0,
          outputs: 0,
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "can retain package data across same-metadata edits while Confect's exact guard rejects it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const directory = path.join(root, "node_modules", "fixture-package");
        const manifest = path.join(directory, "package.json");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(
          path.join(root, "entry.js"),
          'export { default } from "fixture-package";',
        );
        yield* fs.writeFileString(
          path.join(directory, "one.js"),
          "export default 1;",
        );
        yield* fs.writeFileString(
          path.join(directory, "two.js"),
          "export default 2;",
        );
        yield* fs.writeFileString(manifest, '{"main":"./one.js"}');
        const time = 1_000_000_000;
        yield* fs.utimes(manifest, time, time);
        const guard = yield* CompilationInputs.make("Once");
        yield* guard.track([manifest]);
        const probe = yield* context(root);
        expect((yield* probe.resolve("fixture-package")).path).toBe(
          path.join(directory, "one.js"),
        );
        const before = yield* fs.stat(manifest);
        yield* fs.writeFileString(manifest, '{"main":"./two.js"}');
        yield* fs.utimes(manifest, time, time);
        const after = yield* fs.stat(manifest);
        expect(before.ino._tag).toBe("Some");
        expect(after.ino).toEqual(before.ino);
        expect(before.mtime._tag).toBe("Some");
        expect(after.size).toBe(before.size);
        expect(after.mtime).toEqual(before.mtime);
        expect(yield* fs.readFileString(manifest)).toBe('{"main":"./two.js"}');
        expect((yield* probe.resolve("fixture-package")).path).toBe(
          path.join(directory, "one.js"),
        );
        const rejected = yield* guard.check.pipe(Effect.result);
        assert(Result.isFailure(rejected));
        expect(rejected.failure).toMatchObject({
          _tag: "CompilationRestartRequired",
          paths: [manifest],
        });
        const fresh = yield* context(root);
        expect((yield* fresh.resolve("fixture-package")).path).toBe(
          path.join(directory, "two.js"),
        );
        expect(probe.counts).toEqual({
          starts: 0,
          loads: 0,
          ends: 0,
          outputs: 0,
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "replaying observed resolution callbacks does not discover new glob members",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(root, "parts"));
        yield* fs.writeFileString(
          path.join(root, "entry.js"),
          'export const load = (name) => import("./parts/" + name + ".js");',
        );
        yield* fs.writeFileString(
          path.join(root, "parts", "one.js"),
          "export default 1;",
        );
        const probe = yield* context(root);
        const first = yield* probe.rebuild;
        const requests = [...probe.requests];
        const replay = Effect.forEach(requests, (request) =>
          probe
            .resolve(request.path, {
              importer: request.importer,
              namespace: request.namespace,
              resolveDir: request.resolveDir,
              kind: request.kind,
              with: request.with,
            })
            .pipe(
              Effect.map((result) => ({
                path: result.path,
                namespace: result.namespace,
                suffix: result.suffix,
                external: result.external,
                errors: result.errors.map((error) => error.text),
              })),
            ),
        );
        const before = yield* replay;
        const counts = { ...probe.counts };
        yield* fs.writeFileString(
          path.join(root, "parts", "two.js"),
          "export default 2;",
        );
        expect(yield* replay).toEqual(before);
        expect(probe.counts).toEqual(counts);
        const second = yield* probe.rebuild;
        assert(first.metafile && second.metafile);
        expect(
          Object.keys(first.metafile.inputs).some((file) =>
            file.endsWith("parts/two.js"),
          ),
        ).toBe(false);
        expect(
          Object.keys(second.metafile.inputs).some((file) =>
            file.endsWith("parts/two.js"),
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
