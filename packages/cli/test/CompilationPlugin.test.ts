import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import { resolveModulePath } from "exsolve";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import * as CompilationPlugin from "@confect/cli/CompilationPlugin";
import { BundlerError } from "@confect/cli/BuildError";

vi.mock("exsolve", { spy: true });

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationPlugin",
  (it) => {
    it.effect("keeps missing-import diagnostics at each importing source", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entries = [
          path.join(root, "first.js"),
          path.join(root, "second.js"),
        ];
        yield* Effect.forEach(entries, (entry) =>
          fs.writeFileString(entry, 'export { default } from "./missing.js";'),
        );
        const observedFs = { ...fs, watch: () => Stream.never };
        const inputs = yield* CompilationInputs.make().pipe(
          Effect.provideService(FileSystem.FileSystem, observedFs),
        );
        const resolver = yield* CompilationPlugin.make(
          path,
          observedFs,
          [],
          [],
          ["node"],
          inputs,
        );
        const failure = yield* Effect.tryPromise({
          try: () =>
            esbuild.build({
              absWorkingDir: root,
              entryPoints: entries,
              outdir: path.join(root, "output"),
              bundle: true,
              format: "esm",
              platform: "node",
              write: false,
              logLevel: "silent",
              plugins: [resolver.plugin],
            }),
          catch: (cause) => new BundlerError({ cause }),
        }).pipe(Effect.flip);
        const diagnostic = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            errors: Schema.Array(
              Schema.Struct({
                location: Schema.Struct({ file: Schema.String }),
              }),
            ),
          }),
        )(failure.cause);
        expect(
          diagnostic.errors
            .map((error) => path.resolve(root, error.location.file))
            .sort((a, b) => a.localeCompare(b)),
        ).toEqual(entries);
      }).pipe(Effect.scoped),
    );

    it.effect.each(["attributes", "warnings"] as const)(
      "keeps importer-specific native probe semantics for %s",
      (mode) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const entries = [
            path.join(root, "first.js"),
            path.join(root, "second.js"),
          ];
          yield* Effect.forEach(entries, (entry, index) =>
            fs.writeFileString(
              entry,
              `export { default } from "dependency"${mode === "attributes" ? ` with { flavor: "${index}" }` : ""};`,
            ),
          );
          const observedFs = { ...fs, watch: () => Stream.never };
          const inputs = yield* CompilationInputs.make().pipe(
            Effect.provideService(FileSystem.FileSystem, observedFs),
          );
          const resolver = yield* CompilationPlugin.make(
            path,
            observedFs,
            [],
            [],
            ["node"],
            inputs,
          );
          const probes: esbuild.ResolveOptions[] = [];
          const result = yield* Effect.promise(() =>
            esbuild.build({
              absWorkingDir: root,
              entryPoints: entries,
              outdir: path.join(root, "output"),
              bundle: true,
              format: "esm",
              platform: "node",
              write: false,
              logLevel: "silent",
              external: ["dependency"],
              plugins: [
                {
                  name: resolver.plugin.name,
                  setup(build) {
                    return resolver.plugin.setup({
                      ...build,
                      resolve(specifier, options) {
                        return build
                          .resolve(specifier, options)
                          .then((resolved) => {
                            if (options?.kind !== "import-statement")
                              return resolved;
                            probes.push(options);
                            return mode === "warnings"
                              ? {
                                  ...resolved,
                                  warnings: [
                                    {
                                      id: "probe-warning",
                                      pluginName: "native-probe",
                                      text: "importer warning",
                                      detail: undefined,
                                      location: {
                                        file: options.importer ?? "",
                                        namespace: "file",
                                        line: 1,
                                        column: 0,
                                        length: 1,
                                        lineText: "",
                                        suggestion: "",
                                      },
                                      notes: [],
                                    },
                                  ],
                                }
                              : resolved;
                          });
                      },
                    });
                  },
                },
              ],
            }),
          );
          expect(probes).toHaveLength(2);
          expect(
            probes
              .map((probe) => probe.importer)
              .sort((a, b) => (a ?? "").localeCompare(b ?? "")),
          ).toEqual(entries);
          if (mode === "attributes") {
            expect(
              probes
                .map((probe) => probe.with?.flavor)
                .sort((a, b) => (a ?? "").localeCompare(b ?? "")),
            ).toEqual(["0", "1"]);
            expect(result.outputFiles?.[0]?.text).toContain('flavor: "0"');
            expect(result.outputFiles?.[1]?.text).toContain('flavor: "1"');
          } else {
            expect(
              result.warnings
                .map((warning) =>
                  path.resolve(root, warning.location?.file ?? ""),
                )
                .sort((a, b) => a.localeCompare(b)),
            ).toEqual(entries);
          }
        }).pipe(Effect.scoped),
    );

    it.effect(
      "resolves each native subpath once per directory and build",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          for (const directory of [root, path.join(root, "nested")]) {
            const dependency = path.join(directory, "node_modules/dependency");
            yield* fs.makeDirectory(dependency, { recursive: true });
            yield* fs.writeFileString(
              path.join(dependency, "package.json"),
              '{"type":"module","exports":{".":"./entry.js","./other":"./other.js"}}',
            );
            yield* fs.writeFileString(
              path.join(dependency, "entry.js"),
              'export default "entry";',
            );
            yield* fs.writeFileString(
              path.join(dependency, "other.js"),
              'export default "other";',
            );
          }
          const entries = Array.from({ length: 390 }, (_, index) =>
            path.join(root, index % 4 < 2 ? "" : "nested", `entry-${index}.js`),
          );
          yield* Effect.forEach(entries, (entry, index) =>
            fs.writeFileString(
              entry,
              `export { default } from "dependency${index % 2 ? "/other" : ""}";`,
            ),
          );
          const observedFs = { ...fs, watch: () => Stream.never };
          const inputs = yield* CompilationInputs.make().pipe(
            Effect.provideService(FileSystem.FileSystem, observedFs),
          );
          const resolver = yield* CompilationPlugin.make(
            path,
            observedFs,
            [],
            [],
            ["node"],
            inputs,
          );
          const probes: esbuild.ResolveOptions[] = [];
          const context = yield* Effect.acquireRelease(
            Effect.promise(() =>
              esbuild.context({
                entryPoints: entries,
                outdir: path.join(root, "output"),
                bundle: true,
                platform: "node",
                format: "esm",
                write: false,
                metafile: true,
                plugins: [
                  {
                    name: resolver.plugin.name,
                    setup(build) {
                      return resolver.plugin.setup({
                        ...build,
                        resolve(specifier, options) {
                          probes.push(options ?? {});
                          return build.resolve(specifier, options);
                        },
                      });
                    },
                  },
                ],
              }),
            ),
            (acquired) => Effect.promise(() => acquired.dispose()),
          );
          for (let build = 0; build < 2; build++) {
            vi.mocked(resolveModulePath).mockClear();
            probes.length = 0;
            const result = yield* Effect.promise(() => context.rebuild());
            expect(resolveModulePath).toHaveBeenCalledTimes(4);
            expect(
              probes.filter((probe) => probe.kind === "import-statement"),
            ).toHaveLength(4);
            expect(result.outputFiles?.[0]?.text).toContain("entry.js");
            expect(result.outputFiles?.[1]?.text).toContain("other.js");
            expect(result.outputFiles?.[2]?.text).toContain(
              "nested/node_modules/dependency/entry.js",
            );
          }
        }).pipe(Effect.scoped, Effect.timeout("20 seconds")),
      { timeout: 25000 },
    );

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
