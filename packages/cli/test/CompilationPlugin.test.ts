import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as esbuild from "esbuild";
import { resolveModulePath } from "exsolve";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import * as CompilationPlugin from "@confect/cli/CompilationPlugin";
import { BundlerError } from "@confect/cli/BuildError";

vi.mock("exsolve", { spy: true });

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationPlugin",
  (it) => {
    it.effect.each([
      "shared",
      "package-scope",
      "node-modules",
      "css-relative",
    ] as const)(
      "preserves native lookup results with a %s boundary",
      (boundary) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.writeFileString(path.join(root, "package.json"), "{}");
          const dependency = path.join(root, "node_modules", "dependency");
          yield* fs.makeDirectory(dependency, { recursive: true });
          yield* fs.writeFileString(
            path.join(dependency, "package.json"),
            '{"name":"dependency","exports":"./index.js","type":"module"}',
          );
          yield* fs.writeFileString(
            path.join(dependency, "index.js"),
            "export default 1;",
          );
          const entries: string[] = [];
          for (const directory of ["a", "b", "c"]) {
            const folder = path.join(root, directory);
            yield* fs.makeDirectory(folder);
            const entry = path.join(
              folder,
              boundary === "css-relative" ? "entry.css" : "entry.ts",
            );
            entries.push(entry);
            yield* fs.writeFileString(
              entry,
              boundary === "css-relative"
                ? '@import "dependency";'
                : 'import value from "dependency"; export default value;',
            );
            if (boundary === "css-relative") {
              yield* fs.writeFileString(
                path.join(folder, "dependency.css"),
                `.${directory} { color: red; }`,
              );
              continue;
            }
            if (directory !== "a" || boundary === "shared") continue;
            const local =
              boundary === "package-scope"
                ? folder
                : path.join(folder, "node_modules", "dependency");
            yield* fs.makeDirectory(local, { recursive: true });
            yield* fs.writeFileString(
              path.join(local, "package.json"),
              '{"name":"dependency","exports":"./index.js","type":"module"}',
            );
            yield* fs.writeFileString(
              path.join(local, "index.js"),
              "export default 2;",
            );
          }
          const compile = (share: boolean) =>
            Effect.gen(function* () {
              const inputs = yield* CompilationInputs.make("Once");
              yield* Effect.forEach(entries, inputs.trackSource);
              const resolver = yield* CompilationPlugin.make(
                path,
                fs,
                [],
                [],
                ["node"],
                inputs,
                entries,
                share,
              );
              let probes = 0;
              const native = yield* Effect.acquireRelease(
                Effect.tryPromise({
                  try: () =>
                    esbuild.context({
                      absWorkingDir: root,
                      entryPoints: entries,
                      outdir: path.join(root, "output"),
                      bundle: true,
                      format: "esm",
                      platform: "node",
                      tsconfigRaw: {},
                      write: false,
                      metafile: true,
                      logLevel: "silent",
                      plugins: [
                        {
                          name: resolver.plugin.name,
                          setup(build) {
                            return resolver.plugin.setup({
                              ...build,
                              resolve(specifier, options) {
                                if (specifier === "dependency") probes++;
                                return build.resolve(specifier, options);
                              },
                            });
                          },
                        },
                      ],
                    }),
                  catch: (cause) => new BundlerError({ cause }),
                }),
                (context) => Effect.promise(() => context.dispose()),
              );
              const result = yield* Effect.tryPromise({
                try: () => native.rebuild(),
                catch: (cause) => new BundlerError({ cause }),
              });
              yield* inputs.check;
              const firstProbes = probes;
              const rebuilt = yield* Effect.tryPromise({
                try: () => native.rebuild(),
                catch: (cause) => new BundlerError({ cause }),
              });
              expect(probes).toBe(firstProbes * 2);
              expect(rebuilt.metafile).toEqual(result.metafile);
              yield* inputs.check;
              return { result, probes: firstProbes };
            });
          const original = yield* compile(false);
          const shared = yield* compile(true);
          expect(original.probes).toBe(3);
          expect(shared.probes).toBe(
            boundary === "shared" ? 1 : boundary === "css-relative" ? 3 : 2,
          );
          expect(shared.result.metafile).toEqual(original.result.metafile);
          expect(shared.result.outputFiles?.map((file) => file.text)).toEqual(
            original.result.outputFiles?.map((file) => file.text),
          );
          expect(shared.result.warnings).toEqual(original.result.warnings);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "checks restart authority before taking the entry fast path",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const entry = path.join(root, "entry.ts");
          yield* fs.writeFileString(entry, "export default 1;");
          let checked = 0;
          const observedFs = {
            ...fs,
            realPath: (file: string) => {
              if (file === entry) checked++;
              return fs.realPath(file);
            },
          };
          const inputs = yield* CompilationInputs.make("Once");
          const resolver = yield* CompilationPlugin.make(
            path,
            observedFs,
            [],
            [],
            ["node"],
            {
              ...inputs,
              ensure: Effect.fail(
                new CompilationInputs.RestartRequired({ paths: [entry] }),
              ),
            },
            [entry],
          );
          const result = yield* Effect.tryPromise({
            try: () =>
              esbuild.build({
                entryPoints: [entry],
                outdir: path.join(root, "output"),
                bundle: true,
                platform: "node",
                format: "esm",
                write: false,
                logLevel: "silent",
                plugins: [resolver.plugin],
              }),
            catch: (cause) => new BundlerError({ cause }),
          }).pipe(Effect.result);
          expect(Result.isFailure(result)).toBe(true);
          expect(checked).toBe(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        name: "regular TypeScript",
        kind: "regular",
        extension: "ts",
        probes: 0,
      },
      {
        name: "regular JavaScript",
        kind: "regular",
        extension: "js",
        probes: 0,
      },
      { name: "special path", kind: "special", extension: "ts", probes: 1 },
      {
        name: "unavailable identity stat",
        kind: "stat-error",
        extension: "ts",
        probes: 1,
      },
      {
        name: "generated entry",
        kind: "generated",
        extension: "ts",
        probes: 1,
      },
      {
        name: "authored exception",
        kind: "authored",
        extension: "ts",
        probes: 0,
      },
      {
        name: "symlink into generated files",
        kind: "symlink",
        extension: "ts",
        probes: 1,
      },
      {
        name: "JavaScript beside a generated TypeScript symlink",
        kind: "shadow",
        extension: "js",
        probes: 0,
      },
      {
        name: "directory entry",
        kind: "directory",
        extension: "ts",
        probes: 1,
      },
      { name: "missing entry", kind: "missing", extension: "ts", probes: 1 },
    ])("preserves native entry semantics for $name", (testCase) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const generated = path.join(root, "generated");
        yield* fs.makeDirectory(generated);
        const target = path.join(generated, "entry.ts");
        yield* fs.writeFileString(target, "export default 2;");
        const entry = ["generated", "authored"].includes(testCase.kind)
          ? target
          : path.join(
              root,
              testCase.kind === "special"
                ? "entry#name.ts"
                : `entry.${testCase.extension}`,
            );
        if (testCase.kind === "symlink") yield* fs.symlink(target, entry);
        else if (testCase.kind === "directory") {
          yield* fs.makeDirectory(entry);
          yield* fs.writeFileString(
            path.join(entry, "index.js"),
            "export default 3;",
          );
        } else if (
          !["missing", "generated", "authored"].includes(testCase.kind)
        ) {
          yield* fs.writeFileString(entry, "export default 1;");
          if (testCase.kind === "shadow")
            yield* fs.symlink(target, path.join(root, "entry.ts"));
          else if (testCase.extension === "js")
            yield* fs.writeFileString(
              path.join(root, "entry.ts"),
              "export default 99;",
            );
        }
        const compile = (selected: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            const inputs = yield* CompilationInputs.make("Once");
            const resolver = yield* CompilationPlugin.make(
              path,
              testCase.kind === "stat-error"
                ? {
                    ...fs,
                    stat: (file) =>
                      fs.stat(
                        file === entry ? path.join(root, "unavailable") : file,
                      ),
                  }
                : fs,
              [generated],
              testCase.kind === "authored" ? [entry] : [],
              ["node"],
              inputs,
              selected,
            );
            let probes = 0;
            const result = yield* Effect.tryPromise({
              try: () =>
                esbuild.build({
                  absWorkingDir: root,
                  entryPoints: [entry],
                  outdir: path.join(root, "output"),
                  bundle: true,
                  format: "esm",
                  platform: "node",
                  write: false,
                  metafile: true,
                  logLevel: "silent",
                  plugins: [
                    {
                      name: resolver.plugin.name,
                      setup(build) {
                        return resolver.plugin.setup({
                          ...build,
                          resolve(specifier, options) {
                            if (options?.kind === "entry-point") probes++;
                            return build.resolve(specifier, options);
                          },
                        });
                      },
                    },
                  ],
                }),
              catch: (cause) => new BundlerError({ cause }),
            }).pipe(Effect.result);
            return { result, probes };
          });
        const original = yield* compile([]);
        const selected = yield* compile([entry]);
        expect(original.probes).toBe(1);
        expect(selected.probes).toBe(testCase.probes);
        expect(selected.result._tag).toBe(original.result._tag);
        if (Result.isSuccess(original.result)) {
          assert(Result.isSuccess(selected.result));
          expect(selected.result.success.metafile).toEqual(
            original.result.success.metafile,
          );
          expect(
            selected.result.success.outputFiles?.map((file) => file.text),
          ).toEqual(
            original.result.success.outputFiles?.map((file) => file.text),
          );
          expect(selected.result.success.warnings).toEqual(
            original.result.success.warnings,
          );
        } else {
          assert(Result.isFailure(selected.result));
          const diagnostics = Schema.decodeUnknownEffect(
            Schema.Struct({ errors: Schema.Array(Schema.Unknown) }),
          );
          expect(yield* diagnostics(selected.result.failure.cause)).toEqual(
            yield* diagnostics(original.result.failure.cause),
          );
        }
      }).pipe(Effect.scoped),
    );

    it.effect("rechecks selected entry identity on every rebuild", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const generated = path.join(root, "generated");
        yield* fs.makeDirectory(generated);
        const entry = path.join(root, "entry.ts");
        const target = path.join(generated, "target.ts");
        yield* fs.writeFileString(entry, "export default 1;");
        yield* fs.writeFileString(target, "export default 2;");
        const inputs = yield* CompilationInputs.make("Once");
        const resolver = yield* CompilationPlugin.make(
          path,
          fs,
          [generated],
          [],
          ["node"],
          inputs,
          [entry],
        );
        let probes = 0;
        const engine = yield* Effect.acquireRelease(
          Effect.promise(() =>
            esbuild.context({
              entryPoints: [entry],
              outdir: path.join(root, "output"),
              bundle: true,
              platform: "node",
              format: "esm",
              write: false,
              metafile: true,
              logLevel: "silent",
              plugins: [
                {
                  name: resolver.plugin.name,
                  setup(build) {
                    return resolver.plugin.setup({
                      ...build,
                      resolve(specifier, options) {
                        if (options?.kind === "entry-point") probes++;
                        return build.resolve(specifier, options);
                      },
                    });
                  },
                },
              ],
            }),
          ),
          (context) => Effect.promise(() => context.dispose()),
        );
        yield* Effect.promise(() => engine.rebuild());
        expect(probes).toBe(0);
        yield* fs.remove(entry);
        yield* fs.symlink(target, entry);
        const redirected = yield* Effect.promise(() => engine.rebuild());
        expect(probes).toBe(1);
        expect(Object.keys(redirected.metafile?.inputs ?? {})).toContain(
          `${CompilationPlugin.namespace}:${target}`,
        );
        yield* fs.remove(entry);
        yield* fs.writeFileString(entry, "export default 3;");
        yield* Effect.promise(() => engine.rebuild());
        expect(probes).toBe(1);
      }).pipe(Effect.scoped),
    );

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
