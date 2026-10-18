import { describe, expect, it } from "@effect/vitest";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Layer from "effect/Layer";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Queue from "effect/Queue";
import type * as CompilationState from "@confect/cli/CompilationState";
import * as CompilationContext from "@confect/cli/CompilationContext";
import type * as esbuild from "esbuild";

describe("CompilationContext", () => {
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
