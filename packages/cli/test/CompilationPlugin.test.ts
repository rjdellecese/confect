import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as esbuild from "esbuild";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import * as CompilationPlugin from "@confect/cli/CompilationPlugin";

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationPlugin",
  (it) => {
    it.effect(
      "deduplicates discovery reads for 390 roots and refreshes each build",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const measured: number[][] = [];
          for (const count of [1, 390]) {
            const root = yield* fs.makeTempDirectoryScoped();
            const dependency = path.join(root, "node_modules", "dependency");
            const manifest = path.join(dependency, "package.json");
            yield* fs.makeDirectory(dependency, { recursive: true });
            yield* fs.writeFileString(
              manifest,
              '{"type":"module","exports":{".":"./entry.js","./subpath":"./entry.js"}}',
            );
            yield* fs.writeFileString(
              path.join(dependency, "entry.js"),
              'export default "value";',
            );
            const entries: string[] = [];
            for (let index = 0; index < count; index++) {
              const entry = path.join(root, `entry-${index}.js`);
              entries.push(entry);
              yield* fs.writeFileString(
                entry,
                `export { default } from "dependency${index % 2 ? "/subpath" : ""}";`,
              );
            }
            const reads = yield* Ref.make(0);
            const checks = yield* Ref.make(0);
            const observedFs = {
              ...fs,
              watch: () => Stream.never,
              readFile: (file: string) =>
                (file === manifest
                  ? Ref.update(reads, (value) => value + 1)
                  : Effect.void
                ).pipe(Effect.andThen(fs.readFile(file))),
            };
            const inputs = yield* CompilationInputs.make().pipe(
              Effect.provideService(FileSystem.FileSystem, observedFs),
            );
            const resolver = yield* CompilationPlugin.make(
              path,
              observedFs,
              [],
              [],
              ["node"],
              {
                ...inputs,
                checkFiles: (files) =>
                  Ref.update(checks, (value) => value + 1).pipe(
                    Effect.andThen(inputs.checkFiles(files)),
                  ),
              },
            );
            const context = yield* Effect.acquireRelease(
              Effect.promise(() =>
                esbuild.context({
                  entryPoints: entries,
                  outdir: path.join(root, "output"),
                  bundle: true,
                  platform: "node",
                  format: "esm",
                  write: false,
                  logLevel: "silent",
                  plugins: [resolver.plugin],
                }),
              ),
              (acquired) => Effect.promise(() => acquired.dispose()),
            );
            const counts: number[] = [];
            for (let build = 0; build < 2; build++) {
              yield* Ref.set(reads, 0);
              yield* Effect.promise(() => context.rebuild());
              yield* inputs.check;
              counts.push(yield* Ref.get(reads));
              expect(yield* Ref.get(checks)).toBe((build + 1) * 2);
            }
            measured.push(counts);
            yield* fs.writeFileString(
              manifest,
              '{"type":"module","exports":"./changed.js"}',
            );
            expect(
              Exit.isFailure(
                yield* Effect.exit(Effect.promise(() => context.rebuild())),
              ),
            ).toBe(true);
            expect(yield* inputs.pending).toMatchObject({
              _tag: "Some",
              value: { paths: [manifest] },
            });
          }
          expect(measured[1]).toEqual(measured[0]);
          expect(measured[0]).toEqual([5, 4]);
        }).pipe(Effect.scoped, Effect.timeout("20 seconds")),
      { timeout: 25000 },
    );
  },
);
