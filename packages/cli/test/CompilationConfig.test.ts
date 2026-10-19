import * as CompilationConfig from "@confect/cli/CompilationConfig";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as esbuild from "esbuild";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Stream from "effect/Stream";
import { fileURLToPath } from "node:url";

const fixture = Effect.fn("CompilationConfig.test.fixture")(function* (
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, contents.replaceAll("ROOT", root));
  }
  return { root, source: path.join(root, "src/entry.tsx"), fs, path };
});

const buildRaw = (
  source: string,
  tsconfigRaw: esbuild.TsconfigRaw,
  conditions?: string[],
  warnings: ReadonlyArray<esbuild.PartialMessage> = [],
) =>
  Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [source],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
        logLevel: "silent",
        tsconfigRaw,
        plugins: [
          {
            name: "owned-configuration-warnings",
            setup(build) {
              build.onStart(() => ({ warnings: [...warnings] }));
            },
          },
        ],
        ...(conditions === undefined ? {} : { conditions }),
      }),
    catch: (cause) =>
      new CompilationConfig.DiscoveryFailed({ path: source, cause }),
  });

const build = (source: string, conditions?: string[]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let directory = path.dirname(path.resolve(source));
    let configuration: string | undefined;
    while (directory !== path.parse(directory).root) {
      const candidate = path.join(directory, "tsconfig.json");
      if (yield* fs.exists(candidate)) {
        configuration = candidate;
        break;
      }
      directory = path.dirname(directory);
    }
    const native = yield* Effect.tryPromise({
      try: () =>
        esbuild.build({
          entryPoints: [source],
          bundle: true,
          platform: "node",
          format: "esm",
          write: false,
          logLevel: "silent",
          ...(configuration
            ? { tsconfig: configuration }
            : { tsconfigRaw: {} }),
          ...(conditions === undefined ? {} : { conditions }),
        }),
      catch: (cause) =>
        new CompilationConfig.DiscoveryFailed({ path: source, cause }),
    });
    const owned = yield* CompilationConfig.discover(
      source,
      undefined,
      conditions,
    );
    const compiled = yield* buildRaw(
      source,
      owned.tsconfigRaw,
      conditions,
      owned.warnings,
    );
    expect(compiled.outputFiles?.map(({ text }) => text)).toEqual(
      native.outputFiles?.map(({ text }) => text),
    );
    return compiled;
  });

const discoverFiles = <E = never, R = never>(
  source: string,
  observe?: (
    file: string,
    kind: CompilationConfig.CandidateKind,
  ) => Effect.Effect<void, E, R>,
  conditions?: ReadonlyArray<string>,
  observeRuntime?: (
    observation: CompilationConfig.RuntimeObservation,
  ) => Effect.Effect<void, E, R>,
) =>
  CompilationConfig.discover(source, observe, conditions, observeRuntime).pipe(
    Effect.map((discovery) => discovery.files),
  );

const entry = "export const node = <div />";
const chosen = '{"compilerOptions":{"jsxFactory":"chosen.h"}}';

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationConfig",
  (it) => {
    it.effect("preserves the __proto__ paths alias as an own mapping", () =>
      Effect.gen(function* () {
        const { source } = yield* fixture({
          "src/entry.tsx": 'export { value } from "__proto__";',
          "tsconfig.json":
            '{"compilerOptions":{"paths":{"__proto__":["./value.ts"]}}}',
          "value.ts": 'export const value = "chosen-prototype-key";',
        });
        const selected = yield* CompilationConfig.discover(source);
        expect(
          Object.hasOwn(
            selected.tsconfigRaw.compilerOptions?.paths ?? {},
            "__proto__",
          ),
        ).toBe(true);
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen-prototype-key",
        );
      }).pipe(Effect.scoped),
    );
    it.effect(
      "owns filesystem configuration selection despite recognized inert PnP data",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture/base.json"}',
            "node_modules/fixture/base.json": chosen,
            "native-map/base.json":
              '{"compilerOptions":{"jsxFactory":"wrong.h"}}',
            ".pnp.data.json":
              '{"packageRegistryData":[["project",[["root",{"packageLocation":"./","packageDependencies":[["fixture","mapped"]]}]]],["fixture",[["mapped",{"packageLocation":"./native-map/","packageDependencies":[]}]]]]}',
          });
          const selected = yield* CompilationConfig.discover(source);
          expect(selected.files).toContain(
            path.join(root, "node_modules/fixture/base.json"),
          );
          expect(selected.files).not.toContain(
            path.join(root, "native-map/base.json"),
          );
          expect(selected.tsconfigRaw.compilerOptions?.jsxFactory).toBe(
            "chosen.h",
          );
          expect(
            (yield* buildRaw(source, selected.tsconfigRaw)).outputFiles?.[0]
              ?.text,
          ).toContain("chosen.h(");
          const native = yield* Effect.tryPromise({
            try: () =>
              esbuild.build({
                entryPoints: [source],
                bundle: true,
                write: false,
                platform: "node",
                format: "esm",
                logLevel: "silent",
                tsconfig: path.join(root, "tsconfig.json"),
              }),
            catch: (cause) =>
              new CompilationConfig.DiscoveryFailed({ path: source, cause }),
          });
          expect(native.outputFiles?.[0]?.text).toContain("wrong.h(");
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        reason: "MissingExtends",
        config:
          '{"extends":"./missing.json","compilerOptions":{"jsxFactory":"chosen.h"}}',
      },
      {
        reason: "CyclicExtends",
        config: '{"extends":"./base.json"}',
        base: '{"extends":"./tsconfig.json","compilerOptions":{"jsxFactory":"chosen.h"}}',
      },
      {
        reason: "InvalidCompilerOption",
        config:
          '{"extends":"./base.json","compilerOptions":{"jsxFactory":null}}',
        base: chosen,
      },
      {
        reason: "InvalidPaths",
        config:
          '{"compilerOptions":{"jsxFactory":"chosen.h","paths":{"unused":["bare/value"]}}}',
      },
    ])(
      "retains structured $reason diagnostics with owned options",
      ({ reason, config, base }) =>
        Effect.gen(function* () {
          const { source } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": config,
            ...(base === undefined ? {} : { "base.json": base }),
          });
          const selected = yield* CompilationConfig.discover(source);
          expect(selected.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                detail: expect.objectContaining({
                  _tag: "CompilationConfigDiagnostic",
                  reason,
                }),
              }),
            ]),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );
    it.effect(
      "preserves configDir wildcard parent segments until import substitution",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": 'export { value } from "@/a/b";',
            "tsconfig.json":
              '{"compilerOptions":{"paths":{"@/*":["${configDir}/fixtures/*/../value.ts"]}}}',
            "fixtures/a/value.ts": 'export const value = "chosen-placeholder";',
            "fixtures/value.ts": 'export const value = "wrong";',
          });
          const resolved = yield* CompilationConfig.discover(source);
          expect(resolved.tsconfigRaw.compilerOptions?.paths?.["@/*"]).toEqual([
            `${root}${path.sep}fixtures/*/../value.ts`,
          ]);
          expect(
            (yield* buildRaw(source, resolved.tsconfigRaw)).outputFiles?.[0]
              ?.text,
          ).toContain("chosen-placeholder");
        }).pipe(Effect.scoped),
    );
    it.effect("merges every diamond branch in extends order", () =>
      Effect.gen(function* () {
        const { source } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json": '{"extends":["./left.json","./right.json"]}',
          "left.json":
            '{"extends":"./shared.json","compilerOptions":{"jsxFactory":"wrong.h"}}',
          "right.json":
            '{"extends":"./shared.json","compilerOptions":{"strict":false}}',
          "shared.json":
            '{"compilerOptions":{"jsxFactory":"chosen.h","strict":true}}',
        });
        expect((yield* CompilationConfig.discover(source)).tsconfigRaw).toEqual(
          {
            compilerOptions: { jsxFactory: "chosen.h", strict: false },
          },
        );
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect.each([false, true])(
      "retains inherited path origins with a child baseUrl override: %s",
      (override) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": 'export { value } from "alias";',
            "tsconfig.json": override
              ? '{"extends":"./config/base.json","compilerOptions":{"baseUrl":"./other"}}'
              : '{"extends":"./config/base.json"}',
            "config/base.json":
              '{"compilerOptions":{"paths":{"alias":["./value.ts"]}}}',
            "config/value.ts": 'export const value = "chosen-origin";',
            "other/value.ts": 'export const value = "chosen-override";',
            "value.ts": 'export const value = "wrong";',
          });
          const resolved = yield* CompilationConfig.discover(source);
          expect(resolved.tsconfigRaw.compilerOptions?.paths).toEqual({
            alias: [
              `${path.join(root, override ? "other" : "config")}${path.sep}./value.ts`,
            ],
          });
          const output = (yield* build(source)).outputFiles?.[0]?.text;
          expect(output).toContain(
            override ? "chosen-override" : "chosen-origin",
          );
          expect(output).not.toContain('"wrong"');
        }).pipe(Effect.scoped),
    );

    it.effect("keeps wildcard segments until import substitution", () =>
      Effect.gen(function* () {
        const { source } = yield* fixture({
          "src/entry.tsx": 'export { value } from "@/a/b";',
          "tsconfig.json":
            '{"compilerOptions":{"paths":{"@/*":["./*/../shared.ts"]}}}',
          "a/shared.ts": 'export const value = "chosen-wildcard";',
          "shared.ts": 'export const value = "wrong";',
        });
        expect(
          (yield* CompilationConfig.discover(source)).tsconfigRaw
            .compilerOptions?.paths,
        ).toMatchObject({ "@/*": [expect.stringContaining("*/../shared.ts")] });
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen-wildcard",
        );
      }).pipe(Effect.scoped),
    );

    it.effect.each([false, true])(
      "validates bare path targets after the final inherited baseUrl: %s",
      (withBase) =>
        Effect.gen(function* () {
          const { source } = yield* fixture({
            "src/entry.tsx": 'export { value } from "alias";',
            "tsconfig.json": withBase
              ? '{"extends":["./paths.json","./base.json"]}'
              : '{"extends":"./paths.json"}',
            "paths.json":
              '{"compilerOptions":{"paths":{"alias":["lib/value.ts"]}}}',
            "base.json": '{"compilerOptions":{"baseUrl":"."}}',
            "lib/value.ts": 'export const value = "chosen-path";',
            "node_modules/alias/package.json": '{"main":"index.js"}',
            "node_modules/alias/index.js":
              'export const value = "chosen-fallback";',
          });
          const resolved = yield* CompilationConfig.discover(source);
          expect(
            resolved.tsconfigRaw.compilerOptions?.paths?.alias,
          ).toHaveLength(withBase ? 1 : 0);
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            withBase ? "chosen-path" : "chosen-fallback",
          );
        }).pipe(Effect.scoped),
    );

    it.effect("does not erase inherited options with invalid child types", () =>
      Effect.gen(function* () {
        const { source, root, path } = yield* fixture({
          "src/entry.tsx":
            'import { value } from "alias"; export class Value { field = value; }',
          "tsconfig.json":
            '{"extends":"./base.json","compilerOptions":{"baseUrl":null,"paths":null,"useDefineForClassFields":null}}',
          "base.json":
            '{"compilerOptions":{"baseUrl":"./lib","paths":{"alias":["./value.ts"]},"useDefineForClassFields":false}}',
          "lib/value.ts": 'export const value = "chosen";',
        });
        expect(
          (yield* CompilationConfig.discover(source)).tsconfigRaw
            .compilerOptions,
        ).toMatchObject({
          baseUrl: path.join(root, "lib"),
          useDefineForClassFields: false,
        });
        const output = (yield* build(source)).outputFiles?.[0]?.text;
        expect(output).toContain("this.field = value");
        expect(output).toContain('"chosen"');
      }).pipe(Effect.scoped),
    );

    it.effect("expands configDir from each selected lexical profile", () =>
      Effect.gen(function* () {
        const { root, path } = yield* fixture({
          "base.json":
            '{"compilerOptions":{"paths":{"alias":["${configDir}/value.ts"]}}}',
          "one/tsconfig.json": '{"extends":"../base.json"}',
          "two/tsconfig.json": '{"extends":"../base.json"}',
          "one/entry.tsx": 'export { value } from "alias";',
          "two/entry.tsx": 'export { value } from "alias";',
          "one/value.ts": 'export const value = "chosen-one";',
          "two/value.ts": 'export const value = "chosen-two";',
        });
        for (const name of ["one", "two"]) {
          const source = path.join(root, name, "entry.tsx");
          expect(
            (yield* CompilationConfig.discover(source)).tsconfigRaw
              .compilerOptions?.paths,
          ).toEqual({ alias: [path.join(root, name, "value.ts")] });
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            `chosen-${name}`,
          );
        }
      }).pipe(Effect.scoped),
    );

    it.effect.each(["es2021", "es2022"])(
      "preserves inherited target field semantics: %s",
      (target) =>
        Effect.gen(function* () {
          const { source } = yield* fixture({
            "src/entry.tsx": "export class Value { field = 1; }",
            "tsconfig.json": '{"extends":"./base.json"}',
            "base.json": `{"compilerOptions":{"target":"${target}"}}`,
          });
          expect(
            (yield* CompilationConfig.discover(source)).tsconfigRaw
              .compilerOptions?.target,
          ).toBe(target);
          const output = (yield* build(source)).outputFiles?.[0]?.text;
          if (target === "es2021") expect(output).toContain("this.field = 1");
          else expect(output).toContain("field = 1");
        }).pipe(Effect.scoped),
    );

    it.effect("preserves inherited automatic JSX options", () =>
      Effect.gen(function* () {
        const { source } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json": '{"extends":"./base.json"}',
          "base.json":
            '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"fixture-runtime"}}',
          "node_modules/fixture-runtime/package.json":
            '{"exports":{"./jsx-runtime":"./runtime.js"}}',
          "node_modules/fixture-runtime/runtime.js":
            'export function jsx(){return "chosen-runtime"}; export { jsx as jsxs };',
        });
        expect(
          (yield* CompilationConfig.discover(source)).tsconfigRaw
            .compilerOptions,
        ).toEqual({ jsx: "react-jsx", jsxImportSource: "fixture-runtime" });
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen-runtime",
        );
      }).pipe(Effect.scoped),
    );
    it.effect(
      "returns the lexical nearest tsconfig and all absent nearer candidates",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": "{}",
          });
          const result = yield* CompilationConfig.discover(source);
          expect(result).toEqual({
            configuration: path.join(root, "tsconfig.json"),
            tsconfigRaw: { compilerOptions: {} },
            warnings: [],
            files: [
              path.join(root, "src/tsconfig.json"),
              path.join(root, "tsconfig.json"),
            ],
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "excludes the filesystem root from the released find-up search",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const fs = yield* FileSystem.FileSystem;
          const inspected: string[] = [];
          const source = path.join(
            path.parse(path.resolve(".")).root,
            "entry.tsx",
          );
          const result = yield* CompilationConfig.discover(source).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (file) => {
                inspected.push(file);
                return fs.realPath(file);
              },
            }),
          );
          expect(result).toEqual({
            configuration: undefined,
            tsconfigRaw: {},
            warnings: [],
            files: [],
          });
          expect(inspected).toEqual([]);
        }),
    );

    it.effect(
      "selects from the original entry symlink rather than its real directory",
      () =>
        Effect.gen(function* () {
          const { root, path, fs } = yield* fixture({
            "physical/entry.tsx": entry,
            "physical/tsconfig.json": chosen.replace("chosen", "wrong"),
            "lexical/tsconfig.json": chosen,
          });
          const source = path.join(root, "lexical/entry.tsx");
          yield* fs.symlink(path.join(root, "physical/entry.tsx"), source);
          const result = yield* CompilationConfig.discover(source);
          expect(result.configuration).toBe(
            path.join(root, "lexical/tsconfig.json"),
          );
          expect(result.files).not.toContain(
            path.join(root, "physical/tsconfig.json"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect("selects lexical package configs even inside node_modules", () =>
      Effect.gen(function* () {
        const { root, path } = yield* fixture({
          "node_modules/fixture/entry.tsx": entry,
          "node_modules/fixture/tsconfig.json": chosen,
        });
        const source = path.join(root, "node_modules/fixture/entry.tsx");
        const result = yield* CompilationConfig.discover(source);
        expect(result.configuration).toBe(
          path.join(root, "node_modules/fixture/tsconfig.json"),
        );
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "returns raw-empty selection without observing jsconfig or imported nested configs",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": 'export { node } from "./nested/value";',
            "src/jsconfig.json": '{"extends":',
            "src/nested/tsconfig.json": '{"extends":',
            "src/nested/value.tsx":
              "const React = { createElement: () => 1 }; export const node = <div />;",
          });
          const reads: string[] = [];
          const result = yield* CompilationConfig.discover(source).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) => {
                reads.push(file);
                return fs.readFile(file);
              },
            }),
          );
          expect(result.configuration).toBeUndefined();
          expect(result.files).toContain(path.join(root, "src/tsconfig.json"));
          expect(result.files).not.toContain(
            path.join(root, "src/jsconfig.json"),
          );
          expect(result.files).not.toContain(
            path.join(root, "src/nested/tsconfig.json"),
          );
          expect(reads).toEqual([]);
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain(
            "React.createElement(",
          );
          expect(native.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects a nearest tsconfig directory without reading an ancestor config",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "src/tsconfig.json/contents": "{}",
            "tsconfig.json": chosen,
          });
          const reads: string[] = [];
          const result = yield* Effect.result(
            CompilationConfig.discover(source).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readFile: (file) => {
                  reads.push(file);
                  return fs.readFile(file);
                },
              }),
            ),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure).toMatchObject({
              path: path.join(root, "src/tsconfig.json"),
              reason: "NotRegularFile",
            });
          expect(reads).toEqual([]);
        }).pipe(Effect.scoped),
    );

    const nativeCases: ReadonlyArray<{
      readonly name: string;
      readonly files: Readonly<Record<string, string>>;
      readonly dependencies: ReadonlyArray<string>;
      readonly factory?: string;
    }> = [
      {
        name: "nested array extends and nonstandard filenames",
        files: {
          "tsconfig.json":
            '{"extends":["./first", "./nested/second.settings"]}',
          "first.json": '{"compilerOptions":{"jsxFactory":"first.h"}}',
          "nested/second.settings": '{// comment\n"extends":"../base.custom",}',
          "base.custom": chosen,
        },
        dependencies: [
          "tsconfig.json",
          "first",
          "first.json",
          "nested/second.settings",
          "base.custom",
        ],
      },
      {
        name: "absolute extends",
        files: {
          "tsconfig.json": '{"extends":"ROOT/absolute.custom"}',
          "absolute.custom": chosen,
        },
        dependencies: ["absolute.custom"],
      },
      {
        name: "package tsconfig field and transitive extends",
        files: {
          "tsconfig.json": '{"extends":"@fixture/config"}',
          "node_modules/@fixture/config/package.json":
            '{"tsconfig":"configs/base.custom"}',
          "node_modules/@fixture/config/configs/base.custom":
            '{"extends":"./next"}',
          "node_modules/@fixture/config/configs/next.json": chosen,
        },
        dependencies: [
          "node_modules/@fixture/config/package.json",
          "node_modules/@fixture/config/configs/base.custom",
          "node_modules/@fixture/config/configs/next.json",
        ],
      },
      {
        name: "package subpath extension fallback",
        files: {
          "tsconfig.json": '{"extends":"@fixture/config/base"}',
          "node_modules/@fixture/config/base.json": chosen,
        },
        dependencies: [
          "node_modules/@fixture/config/package.json",
          "node_modules/@fixture/config/base/tsconfig.json",
          "node_modules/@fixture/config/base",
          "node_modules/@fixture/config/base.json",
        ],
      },
      {
        name: "package default config",
        files: {
          "tsconfig.json": '{"extends":"fixture"}',
          "node_modules/fixture/tsconfig.json": chosen,
        },
        dependencies: [
          "node_modules/fixture/package.json",
          "node_modules/fixture/tsconfig.json",
        ],
      },
      {
        name: "package conditional exports",
        files: {
          "tsconfig.json": '{"extends":"fixture"}',
          "node_modules/fixture/package.json":
            '{"exports":{"import":"./unused.json","require":"./actual.custom","default":"./other.json"}}',
          "node_modules/fixture/actual.custom": chosen,
        },
        dependencies: [
          "node_modules/fixture/package.json",
          "node_modules/fixture/actual.custom",
        ],
      },
      {
        name: "package wildcard exports with suffix",
        files: {
          "tsconfig.json": '{"extends":"fixture/setting-prod.json"}',
          "node_modules/fixture/package.json":
            '{"exports":{"./setting-*.json":"./configs/*.custom"}}',
          "node_modules/fixture/configs/prod.custom": chosen,
        },
        dependencies: ["node_modules/fixture/configs/prod.custom"],
      },
      {
        name: "package export array",
        files: {
          "tsconfig.json": '{"extends":"fixture"}',
          "node_modules/fixture/package.json":
            '{"exports":[null,"invalid-package-target","./actual.custom"]}',
          "node_modules/fixture/actual.custom": chosen,
        },
        dependencies: ["node_modules/fixture/actual.custom"],
      },
      {
        name: "jsconfig is ignored when no tsconfig is selected",
        files: {
          "jsconfig.json": '{"extends":"./base.custom"}',
          "base.custom": chosen,
        },
        dependencies: ["src/tsconfig.json", "tsconfig.json"],
        factory: "React.createElement",
      },
      {
        name: "nearest tsconfig ignores parent jsconfig",
        files: {
          "jsconfig.json": '{"extends":"./parent.custom"}',
          "parent.custom": '{"compilerOptions":{"jsxFactory":"parent.h"}}',
          "src/tsconfig.json": chosen,
          "src/jsconfig.json": '{"extends":"./not-read"}',
        },
        dependencies: ["src/tsconfig.json"],
      },
    ];
    it.effect.each(nativeCases)(
      "matches native esbuild: $name",
      ({ files, dependencies, factory = "chosen.h" }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            ...files,
          });
          const discovered = yield* discoverFiles(source);
          for (const file of dependencies)
            expect(discovered).toContain(path.join(root, file));
          const result = yield* build(source);
          expect(result.outputFiles?.[0]?.text).toContain(`${factory}(`);
          expect(result.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each(
      ["tsconfig.json", "jsconfig.json"].flatMap((configName) =>
        ["config", "extends"].map((malformed) => ({ configName, malformed })),
      ),
    )(
      "ignores a shadowed malformed parent $configName $malformed with explicit selection",
      ({ configName, malformed }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "src/tsconfig.json": chosen,
            [configName]:
              malformed === "config"
                ? '{"extends":'
                : '{"extends":"./parent.custom"}',
            "parent.custom": '{"extends":',
          });
          const discovered = yield* CompilationConfig.discover(source);
          expect(discovered.configuration).toBe(
            path.join(root, "src/tsconfig.json"),
          );
          expect(discovered.files).not.toContain(path.join(root, configName));
          expect(discovered.files).not.toContain(
            path.join(root, "parent.custom"),
          );
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each(["tsconfig.json", "jsconfig.json"])(
      "ignores missing extends from shadowed parent %s under the released profile",
      (configName) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "src/tsconfig.json": chosen,
            [configName]:
              '{"extends":"./parent.custom","compilerOptions":{"jsxFactory":"unused.h"}}',
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).not.toContain(path.join(root, "parent.custom"));
          expect(discovered).not.toContain(
            path.join(root, "parent.custom.json"),
          );
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "does not read ignored same-directory jsconfig or unrelated sibling configuration",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": chosen,
            "jsconfig.json": '{"extends":"./ignored.custom"}',
            "ignored.custom": '{"extends":',
            "unrelated/tsconfig.json": '{"extends":',
          });
          const reads: string[] = [];
          const discovered = yield* discoverFiles(source).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) => {
                reads.push(file);
                return fs.readFile(file);
              },
            }),
          );
          for (const name of [
            "jsconfig.json",
            "ignored.custom",
            "unrelated/tsconfig.json",
          ]) {
            expect(discovered).not.toContain(path.join(root, name));
            expect(reads).not.toContain(path.join(root, name));
          }
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        name: "extends",
        config: '{"extends":"./first.custom","extends":"./second.custom"}',
        manifest: "{}",
        first: "first.custom",
        second: "second.custom",
      },
      {
        name: "manifest tsconfig",
        config: '{"extends":"fixture"}',
        manifest: '{"tsconfig":"./first.custom","tsconfig":"./second.custom"}',
        first: "node_modules/fixture/first.custom",
        second: "node_modules/fixture/second.custom",
      },
      {
        name: "manifest exports",
        config: '{"extends":"fixture"}',
        manifest: '{"exports":"./first.custom","exports":"./second.custom"}',
        first: "node_modules/fixture/first.custom",
        second: "node_modules/fixture/second.custom",
      },
      {
        name: "exact export keys",
        config: '{"extends":"fixture/settings"}',
        manifest:
          '{"exports":{"./settings":"./first.custom","./settings":"./second.custom"}}',
        first: "node_modules/fixture/first.custom",
        second: "node_modules/fixture/second.custom",
      },
      {
        name: "wildcard export keys",
        config: '{"extends":"fixture/settings"}',
        manifest:
          '{"exports":{"./*":"./first-*.custom","./*":"./second-*.custom"}}',
        first: "node_modules/fixture/first-settings.custom",
        second: "node_modules/fixture/second-settings.custom",
      },
      {
        name: "conditional export keys",
        config: '{"extends":"fixture"}',
        manifest:
          '{"exports":{"require":"./first.custom","require":"./second.custom"}}',
        first: "node_modules/fixture/first.custom",
        second: "node_modules/fixture/second.custom",
      },
    ])(
      "uses the first duplicate $name like native esbuild",
      ({ config, manifest, first, second }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": config,
            "node_modules/fixture/package.json": manifest,
            [first]: chosen,
            [second]: chosen.replace("chosen", "wrong"),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(path.join(root, first));
          expect(discovered).not.toContain(path.join(root, second));
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each(["[]", "[null]", '["invalid-target"]', "null"])(
      "preserves terminal export condition targets: %s",
      (target) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":{"require":${target},"default":"./wrong.custom"}}`,
            "node_modules/fixture/tsconfig.json": chosen,
            "node_modules/fixture/wrong.custom": chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture/tsconfig.json"),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/wrong.custom"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([undefined, []] as const)(
      "matches the native implicit module condition for %s",
      (conditions) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json":
              '{"exports":{"module":"./module.custom","require":"./require.custom"}}',
            "node_modules/fixture/module.custom": chosen,
            "node_modules/fixture/require.custom": chosen.replace(
              "chosen",
              "required",
            ),
          });
          const discovered = yield* discoverFiles(
            source,
            undefined,
            conditions,
          );
          const target = conditions === undefined ? "module" : "require";
          expect(discovered).toContain(
            path.join(root, `node_modules/fixture/${target}.custom`),
          );
          expect(
            (yield* build(source, conditions === undefined ? undefined : []))
              .outputFiles?.[0]?.text,
          ).toContain(conditions === undefined ? "chosen.h(" : "required.h(");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "uses the native custom conditions without selecting an import-only target",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json":
              '{"exports":{"custom":"./custom.json","require":"./fallback.json"}}',
            "node_modules/fixture/custom.json": chosen,
          });
          const discovered = yield* discoverFiles(source, undefined, [
            "custom",
          ]);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture/custom.json"),
          );
          expect(
            (yield* build(source, ["custom"])).outputFiles?.[0]?.text,
          ).toContain("chosen.h(");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "observes missing extends before they appear and config-only changes",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"./future.custom"}',
          });
          const base = path.join(root, "future.custom");
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(base);
          expect(discovered).toContain(`${base}.json`);
          expect((yield* build(source)).warnings).toHaveLength(1);
          yield* fs.writeFileString(base, chosen);
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
          yield* fs.writeFileString(base, chosen.replace("chosen", "edited"));
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "edited.h(",
          );
          expect(yield* fs.readFileString(source)).toBe(entry);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "tracks missing export targets even when native package fallback succeeds",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json":
              '{"exports":"./future.custom"}',
            "node_modules/fixture/tsconfig.json": chosen,
          });
          const future = path.join(root, "node_modules/fixture/future.custom");
          expect(yield* discoverFiles(source)).toContain(future);
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
          yield* fs.writeFileString(
            future,
            chosen.replace("chosen", "appeared"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "appeared.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "baselines every read first and exposes discovery-time changes",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"./before.custom"}',
            "before.custom": chosen,
            "after.custom": chosen,
          });
          const config = path.join(root, "tsconfig.json");
          const baselines = new Map<string, string>();
          let changed = false;
          const result = yield* discoverFiles(source, (file, kind) =>
            Effect.gen(function* () {
              if (kind === "File" && !baselines.has(file))
                baselines.set(file, yield* fs.readFileString(file));
              if (file === config && !changed) {
                changed = true;
                yield* fs.writeFileString(
                  config,
                  '{"extends":"./after.custom"}',
                );
              }
            }),
          ).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) =>
                Effect.gen(function* () {
                  expect(baselines.has(file)).toBe(true);
                  return yield* fs.readFile(file);
                }),
            }),
          );
          expect(result).toContain(path.join(root, "after.custom"));
          expect(baselines.get(config)).not.toBe(
            yield* fs.readFileString(config),
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      "direct",
      "config-alias",
      "extends-alias",
      "manifest-alias",
      "changed-alias",
    ] as const)("rejects forbidden reads before opening files: %s", (mode) =>
      Effect.gen(function* () {
        const { source, root, path, fs } = yield* fixture({
          "src/entry.tsx": entry,
        });
        const config = path.join(root, "tsconfig.json");
        const secret = path.join(root, ".env.local");
        const alias = path.join(root, "base.custom");
        yield* fs.writeFileString(secret, "forbidden fixture contents");
        if (mode === "config-alias") yield* fs.symlink(secret, config);
        else if (mode === "manifest-alias") {
          yield* fs.writeFileString(config, '{"extends":"fixture"}');
          const directory = path.join(root, "node_modules/fixture");
          yield* fs.makeDirectory(directory, { recursive: true });
          yield* fs.symlink(secret, path.join(directory, "package.json"));
        } else {
          yield* fs.writeFileString(
            config,
            mode === "direct"
              ? '{"extends":"./.env.local"}'
              : '{"extends":"./base.custom"}',
          );
          if (mode === "changed-alias") yield* fs.writeFileString(alias, "{}");
          else yield* fs.symlink(secret, alias);
        }
        const reads: string[] = [];
        const outcome = yield* Effect.result(
          discoverFiles(source, (file) =>
            Effect.gen(function* () {
              if (mode === "changed-alias" && file === alias) {
                yield* fs.remove(alias);
                yield* fs.symlink(secret, alias);
              }
            }),
          ).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) => {
                reads.push(file);
                return fs.readFile(file);
              },
            }),
          ),
        );
        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome))
          expect(outcome.failure).toMatchObject({
            _tag: "CompilationConfigDiscoveryRejected",
            reason: "ForbiddenFile",
          });
        expect(reads).not.toContain(secret);
        expect(reads).not.toContain(alias);
        if (mode === "config-alias") expect(reads).toHaveLength(0);
      }).pipe(Effect.scoped),
    );

    it.effect(
      "resolves extends relative to the config realpath and observes both identities",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "shared/config.custom": '{"extends":"./base.custom"}',
            "shared/base.custom": chosen,
            "base.custom": chosen.replace("chosen", "wrong"),
          });
          const alias = path.join(root, "tsconfig.json");
          const actual = path.join(root, "shared/config.custom");
          yield* fs.symlink(actual, alias);
          const discovered = yield* discoverFiles(source);
          expect(discovered).toEqual(
            expect.arrayContaining([
              alias,
              actual,
              path.join(root, "shared/base.custom"),
            ]),
          );
          expect(discovered).not.toContain(path.join(root, "base.custom"));
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "resolves an extended symlink from its real directory instead of its alias directory",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"./alias.custom"}',
            "shared/config.custom": '{"extends":"./base.custom"}',
            "shared/base.custom": chosen,
            "base.custom": chosen.replace("chosen", "wrong"),
          });
          const alias = path.join(root, "alias.custom");
          const actual = path.join(root, "shared/config.custom");
          yield* fs.symlink(actual, alias);
          const discovered = yield* discoverFiles(source);
          expect(discovered).toEqual(
            expect.arrayContaining([
              alias,
              actual,
              path.join(root, "shared/base.custom"),
            ]),
          );
          expect(discovered).not.toContain(path.join(root, "base.custom"));
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        exports:
          '{"require":{"require":"./wrong.custom","./mixed":"./other.custom"}}',
        target: "tsconfig.json",
      },
      {
        exports: '{".":"./wrong.custom","require":"./wrong.custom"}',
        target: "tsconfig.json",
      },
      {
        exports:
          '[{".":"./wrong.custom","require":"./wrong.custom"},"./actual.custom"]',
        target: "actual.custom",
      },
      {
        exports:
          '{"require":{".":"./wrong.custom","require":"./wrong.custom"},"default":"./wrong.custom"}',
        target: "tsconfig.json",
      },
      { exports: "true", target: "tsconfig.json" },
      { exports: '[true,"./actual.custom"]', target: "actual.custom" },
    ])(
      "preserves native fallback for malformed export maps: $exports",
      ({ exports, target }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":${exports}}`,
            [`node_modules/fixture/${target}`]: chosen,
            "node_modules/fixture/wrong.custom": chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture", target),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/wrong.custom"),
          );
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings.length).toBeGreaterThan(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      { encoded: "space%20name.custom", decoded: "space name.custom" },
      { encoded: "%E2%9C%93.custom", decoded: "✓.custom" },
      { encoded: "plus+name.custom", decoded: "plus+name.custom" },
      { encoded: "percent%25name.custom", decoded: "percent%name.custom" },
      { encoded: "%62ase.custom", decoded: "base.custom" },
      { encoded: "%62ase.custom/", decoded: "base.custom" },
      { encoded: "%2e%2e/outside.custom", decoded: "../outside.custom" },
    ])(
      "observes native decoded export targets: $encoded",
      ({ encoded, decoded }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":"./${encoded}"}`,
            [`node_modules/fixture/${decoded}`]: chosen,
          });
          expect(yield* discoverFiles(source)).toContain(
            path.join(root, "node_modules/fixture", decoded),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        name: "literal backslash target",
        extension: "fixture",
        packageName: "fixture",
        exports: '{"exports":"./base\\\\name.custom"}',
        target: "node_modules/fixture/base\\name.custom",
      },
      {
        name: "subsequent literal star in an export key",
        extension: "fixture/preAmid*post",
        packageName: "fixture",
        exports: '{"exports":{"./pre*mid*post":"./actual.custom"}}',
        target: "node_modules/fixture/actual.custom",
      },
      {
        name: "unmatched subsequent star uses filesystem fallback",
        extension: "fixture/preAmidBpost",
        packageName: "fixture",
        exports: '{"exports":{"./pre*mid*post":"./wrong.custom"}}',
        target: "node_modules/fixture/preAmidBpost.json",
      },
      {
        name: "encoded subpath matches its exact export key",
        extension: "fixture/encoded%20name",
        packageName: "fixture",
        exports: '{"exports":{"./encoded%20name":"./actual.custom"}}',
        target: "node_modules/fixture/actual.custom",
      },
      {
        name: "percent in a package name skips exports but uses filesystem fallback",
        extension: "fixture%name",
        packageName: "fixture%name",
        exports: '{"exports":"./wrong.custom"}',
        target: "node_modules/fixture%name/tsconfig.json",
      },
      {
        name: "backslash in a package name skips exports but uses filesystem fallback",
        extension: "fixture\\name",
        packageName: "fixture\\name",
        exports: '{"exports":"./wrong.custom"}',
        target: "node_modules/fixture\\name/tsconfig.json",
      },
    ])(
      "matches native config lookup for $name",
      ({ extension, packageName, exports, target }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": `{"extends":"${extension.replaceAll("\\", "\\\\")}"}`,
            [`node_modules/${packageName}/package.json`]: exports,
            [target]: chosen,
            [`node_modules/${packageName}/wrong.custom`]: chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(path.join(root, target));
          expect(discovered).not.toContain(
            path.join(root, "node_modules", packageName, "wrong.custom"),
          );
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      { exports: '"./nested/../wrong.custom"', target: "tsconfig.json" },
      {
        exports: '["./nested/../wrong.custom","./actual.custom"]',
        target: "actual.custom",
      },
      { exports: '"./nested\\\\..\\\\wrong.custom"', target: "tsconfig.json" },
    ])(
      "follows native fallback for invalid export targets: $exports",
      ({ exports, target }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":${exports}}`,
            [`node_modules/fixture/${target}`]: chosen,
            "node_modules/fixture/wrong.custom": chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture", target),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/wrong.custom"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      "bad%2ftarget.custom",
      "bad%5Ctarget.custom",
      "bad%GG.custom",
    ])(
      "uses native package fallback for invalid encoded exports: %s",
      (encoded) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":["./${encoded}","./wrong.custom"]}`,
            "node_modules/fixture/tsconfig.json": chosen,
            "node_modules/fixture/wrong.custom": chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture/tsconfig.json"),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/wrong.custom"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "observes decoded missing exports before their targets appear",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json":
              '{"exports":"./future%20config.custom"}',
            "node_modules/fixture/tsconfig.json": chosen,
          });
          const future = path.join(
            root,
            "node_modules/fixture/future config.custom",
          );
          expect(yield* discoverFiles(source)).toContain(future);
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
          yield* fs.writeFileString(
            future,
            chosen.replace("chosen", "appeared"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "appeared.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects decoded forbidden export targets before observation or reads",
      () =>
        Effect.gen(function* () {
          const { source, root, path, fs } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": '{"exports":"./%2eenv.local"}',
            "node_modules/fixture/.env.local": "must not be read",
          });
          const forbidden = path.join(root, "node_modules/fixture/.env.local");
          const observed: string[] = [];
          const read: string[] = [];
          const outcome = yield* Effect.result(
            discoverFiles(source, (file) =>
              Effect.sync(() => {
                observed.push(file);
              }),
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readFile: (file) => {
                  read.push(file);
                  return fs.readFile(file);
                },
              }),
            ),
          );
          expect(Result.isFailure(outcome)).toBe(true);
          if (Result.isFailure(outcome))
            expect(outcome.failure).toMatchObject({ reason: "ForbiddenFile" });
          expect(observed).not.toContain(forbidden);
          expect(read).not.toContain(forbidden);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      { encoded: "%FF.custom", reason: "NonUtf8PackageExportTarget" },
      { encoded: "%00.custom", reason: "NullBytePackageExportTarget" },
    ])(
      "explicitly rejects unrepresentable encoded targets: $reason",
      ({ encoded, reason }) =>
        Effect.gen(function* () {
          const { source } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            "node_modules/fixture/package.json": `{"exports":"./${encoded}"}`,
          });
          const outcome = yield* Effect.result(discoverFiles(source));
          expect(Result.isFailure(outcome)).toBe(true);
          if (Result.isFailure(outcome))
            expect(outcome.failure).toMatchObject({ reason });
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        extension: "fixture/settings/base",
        exports: '{"./settings/":"./redirect/"}',
        candidate: "settings/base.json",
      },
      {
        extension: "fixture/settings/",
        exports: '{"./settings/":"./redirect/"}',
        candidate: "settings/tsconfig.json",
      },
      {
        extension: "fixture/settings/base",
        exports: '{"./settings/":"./redirect/","./settings*":"./wild*.custom"}',
        candidate: "settings/base.json",
      },
    ])(
      "uses native config fallback instead of directory export expansion: $extension",
      ({ extension, exports, candidate }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": `{"extends":"${extension}"}`,
            "node_modules/fixture/package.json": `{"exports":${exports}}`,
            [`node_modules/fixture/${candidate}`]: chosen,
            "node_modules/fixture/redirect/base": chosen.replace(
              "chosen",
              "wrong",
            ),
            "node_modules/fixture/wild/base.custom": chosen.replace(
              "chosen",
              "wrong",
            ),
          });
          const discovered = yield* discoverFiles(source);
          expect(discovered).toContain(
            path.join(root, "node_modules/fixture", candidate),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/redirect/base"),
          );
          expect(discovered).not.toContain(
            path.join(root, "node_modules/fixture/wild/base.custom"),
          );
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect("reports directory candidates without reading them", () =>
      Effect.gen(function* () {
        const { source, root, path } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json": '{"extends":"./base"}',
          "base/unused": "",
          "base.json": chosen,
        });
        const observations = new Map<string, CompilationConfig.CandidateKind>();
        yield* discoverFiles(source, (file, kind) =>
          Effect.sync(() => {
            observations.set(file, kind);
          }),
        );
        expect(observations.get(path.join(root, "base"))).toBe("Directory");
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect("terminates cyclic inheritance like native esbuild", () =>
      Effect.gen(function* () {
        const { source, root, path } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json": '{"extends":"./base.custom"}',
          "base.custom":
            '{"extends":"./tsconfig.json","compilerOptions":{"jsxFactory":"chosen.h"}}',
        });
        expect(yield* discoverFiles(source)).toContain(
          path.join(root, "base.custom"),
        );
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "uses filesystem inheritance without an active Yarn runtime or evaluating inert metadata",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            ".pnp.cjs": "throw new Error('must not execute')",
            "node_modules/fixture/tsconfig.json": chosen,
          });
          const result = yield* CompilationConfig.discover(source);
          expect(result.files).toContain(
            path.join(root, "node_modules/fixture/tsconfig.json"),
          );
          expect(result.tsconfigRaw).toEqual({
            compilerOptions: { jsxFactory: "chosen.h" },
          });
          expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
            "chosen.h(",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each(
      [".pnp.cjs", ".pnp.js", ".pnp.data.json"].flatMap((marker) =>
        ["none", "relative", "absolute"].map((mode) => ({ marker, mode })),
      ),
    )("allows $marker with $mode config inheritance", ({ marker, mode }) =>
      Effect.gen(function* () {
        const { source, root, path } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json":
            mode === "none"
              ? chosen
              : mode === "relative"
                ? '{"extends":"./base.custom"}'
                : '{"extends":"ROOT/base.custom"}',
          "base.custom": chosen,
          [marker]: marker.endsWith(".json")
            ? "{}"
            : "throw new Error('must not execute')",
        });
        const discovered = yield* discoverFiles(source);
        expect(discovered).toContain(path.join(root, "tsconfig.json"));
        if (mode !== "none")
          expect(discovered).toContain(path.join(root, "base.custom"));
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves old and new Node execution through real Yarn zip configs",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner;
          const root = yield* fs.makeTempDirectoryScoped();
          const project = path.join(root, "project");
          const config = path.join(root, "config");
          yield* fs.makeDirectory(project);
          yield* fs.makeDirectory(config);
          yield* fs.symlink(
            fileURLToPath(new URL("../node_modules", import.meta.url)),
            path.join(root, "node_modules"),
          );
          yield* fs.writeFileString(
            path.join(project, "package.json"),
            '{"name":"pnp-config-fixture","private":true,"type":"module","packageManager":"yarn@4.18.1","dependencies":{"config":"file:../config"}}',
          );
          yield* fs.writeFileString(
            path.join(project, ".yarnrc.yml"),
            "nodeLinker: pnp\nenableGlobalCache: false\nenableTelemetry: false\npnpEnableEsmLoader: true\n",
          );
          yield* fs.writeFileString(
            path.join(config, "package.json"),
            '{"name":"config","version":"1.0.0","type":"module","exports":{".":{"import":"./import.json","require":"./require.json"},"./missing":"./absent.json","./runtime":"./runtime.js"}}',
          );
          yield* fs.writeFileString(
            path.join(config, "import.json"),
            '{"extends":"./shared.json"}',
          );
          yield* fs.writeFileString(path.join(config, "shared.json"), chosen);
          yield* fs.writeFileString(
            path.join(config, "require.json"),
            `{"extends":"${path.join(project, "require-base.json").split(path.sep).join("/")}"}`,
          );
          yield* fs.writeFileString(
            path.join(project, "require-base.json"),
            '{"compilerOptions":{"jsxFactory":"wrong.h"}}',
          );
          yield* fs.writeFileString(
            path.join(config, "runtime.js"),
            'export const value = "chosen";',
          );
          yield* fs.writeFileString(
            path.join(project, "tsconfig.json"),
            '{"extends":"config"}',
          );
          yield* fs.writeFileString(
            path.join(project, "entry.tsx"),
            'import { value } from "config/runtime"; const chosen = { h: () => value }; const wrong = { h: () => "wrong" }; export const valueFromConfig = <div />; export { value };',
          );
          yield* fs.makeDirectory(path.join(project, "nested"));
          yield* fs.writeFileString(
            path.join(project, "nested/tsconfig.json"),
            '{"extends":"config"}',
          );
          yield* fs.writeFileString(
            path.join(project, "nested/value.tsx"),
            'const chosen = { h: () => "import" }; const wrong = { h: () => "require" }; export const value = <div />;',
          );
          yield* fs.writeFileString(
            path.join(project, "require-entry.ts"),
            'export const value = require("./nested/value.tsx").value;',
          );
          const yarn = fileURLToPath(
            new URL(
              "bin/yarn.js",
              import.meta.resolve("@yarnpkg/cli-dist/package.json"),
            ),
          );
          const run = (args: ReadonlyArray<string>) =>
            Effect.gen(function* () {
              const child = yield* spawner.spawn(
                ChildProcess.make(process.execPath, [yarn, ...args], {
                  cwd: project,
                  env: { YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
                  extendEnv: true,
                }),
              );
              const output = yield* child.all.pipe(
                Stream.decodeText(),
                Stream.mkString,
              );
              expect(yield* child.exitCode, output).toBe(0);
              return output;
            });
          yield* run(["install"]);
          const runner = path.join(root, "runner.mjs");
          yield* Effect.tryPromise({
            try: () =>
              esbuild.build({
                stdin: {
                  contents: `
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import Module from "node:module";
import { bundleRequire } from "bundle-require";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Bundler from "./Bundler";
import * as Compilation from "./Compilation";
import * as CompilationConfig from "./CompilationConfig";

const entry = path.resolve("entry.tsx");
const config = path.resolve("tsconfig.json");
const run = (effect) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer)));
const observations = [];
let observedFiles = 0;
const discovery = await run(CompilationConfig.discover(entry, () => Effect.sync(() => { observedFiles++; }), [], (observation) => Effect.sync(() => { observations.push(observation); })));
const files = discovery.files;
const portable = file => file.split(path.sep).join("/");
const archive = files.find(file => file.endsWith(".zip"));
assert(archive);
assert(files.some(file => portable(file).includes(".zip/") && portable(file).endsWith("/import.json")));
assert(files.some(file => portable(file).includes(".zip/") && portable(file).endsWith("/shared.json")));
assert(!files.some(file => portable(file).endsWith("/require.json")));
assert.equal(observations.length, 1);
const runtime = observations[0];
const before = observedFiles;
assert.equal(await Effect.runPromise(runtime.current), runtime.value);
assert.equal(observedFiles, before);
assert.equal(runtime.value, Module.findPnpApi(entry));

const old = await bundleRequire({ filepath: entry, cwd: path.dirname(entry), format: "esm", esbuildOptions: { logLevel: "silent" } });
assert.equal(old.mod.value, "chosen");
assert.equal(old.mod.valueFromConfig, "chosen");
for (const mode of ["Once", "Watch"]) {
  const loaded = await run(Bundler.bundle(entry).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [], mode }))));
  assert.equal(loaded.module.value, old.mod.value);
  assert.equal(loaded.module.valueFromConfig, old.mod.valueFromConfig);
}

const requiredBase = path.resolve("require-base.json");
const nestedDiscovery = await run(CompilationConfig.discover(path.resolve("nested/value.tsx"), undefined, []));
assert.equal(nestedDiscovery.configuration, path.resolve("nested/tsconfig.json"));
assert(!nestedDiscovery.files.includes(requiredBase));
assert(nestedDiscovery.files.some(file => portable(file).includes(".zip/") && portable(file).endsWith("/import.json")));
const nativeRequire = await import("esbuild").then(esbuild => esbuild.build({ entryPoints: [path.resolve("require-entry.ts")], absWorkingDir: process.cwd(), bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent", tsconfig: config }));
assert(nativeRequire.outputFiles[0].text.includes("chosen.h("));
await fs.writeFile(path.resolve("nested/tsconfig.json"), '{"extends":');
try {
  await run(Effect.gen(function* () {
    const compiler = yield* Compilation.Service;
    const loaded = yield* Bundler.bundle(path.resolve("require-entry.ts"));
    assert.equal(loaded.module.value, "import");
    yield* Effect.promise(() => fs.writeFile(requiredBase, "{}"));
    const changed = yield* Effect.result(compiler.verify);
    assert(Result.isSuccess(changed));
  }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [], mode: "Once" }))));
} finally {
  await fs.writeFile(requiredBase, '{"compilerOptions":{"jsxFactory":"wrong.h"}}');
  await fs.writeFile(path.resolve("nested/tsconfig.json"), '{"extends":"config"}');
}

await fs.writeFile(config, '{"extends":"config/missing"}');
const missing = (await run(CompilationConfig.discover(entry))).files;
assert(missing.some(file => portable(file).includes(".zip/") && portable(file).endsWith("/absent.json")));
await fs.writeFile(config, '{"extends":"config"}');

const secret = path.resolve(".env.local");
await fs.writeFile(secret, "throw new Error('forbidden file was evaluated')");
for (const guarded of [runtime.path, archive]) {
  const backup = guarded + ".backup";
  await fs.rename(guarded, backup);
  try {
    await fs.symlink(secret, guarded);
    const rejected = await Effect.runPromise(Effect.result(runtime.current));
    assert(Result.isFailure(rejected));
    assert.equal(rejected.failure.reason, "ForbiddenFile");
  } finally {
    await fs.rm(guarded, { force: true });
    await fs.rename(backup, guarded);
  }
}

await run(Effect.gen(function* () {
  const compiler = yield* Compilation.Service;
  yield* Bundler.bundle(entry);
  yield* Effect.sleep("550 millis");
  const future = new Date(Date.now() + 10000);
  yield* Effect.promise(() => fs.utimes(runtime.path, future, future));
  const changed = yield* Effect.result(compiler.verify);
  assert(Result.isFailure(changed));
  assert.equal(changed.failure.cause._tag, "CompilationRestartRequired");
  assert(changed.failure.cause.paths.includes(runtime.path));
  assert(Result.isFailure(yield* Effect.result(compiler.verify)));
}).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [], mode: "Once" }))));

const archiveSize = (await fs.stat(archive)).size;
try {
  await run(Effect.gen(function* () {
    const compiler = yield* Compilation.Service;
    yield* Bundler.bundle(entry);
    yield* Effect.promise(() => fs.appendFile(archive, new Uint8Array([0])));
    const changed = yield* Effect.result(compiler.verify);
    assert(Result.isFailure(changed));
    assert.equal(changed.failure.cause._tag, "CompilationRestartRequired");
    assert(changed.failure.cause.paths.includes(archive));
  }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [], mode: "Once" }))));
} finally {
  await fs.truncate(archive, archiveSize);
}

await run(Effect.gen(function* () {
  const compiler = yield* Compilation.Service;
  yield* Bundler.bundle(entry);
  yield* Effect.promise(() => fs.appendFile(runtime.path, "\\n"));
  const changed = yield* Effect.result(compiler.verify);
  assert(Result.isFailure(changed));
  assert.equal(changed.failure.cause._tag, "CompilationRestartRequired");
  assert(changed.failure.cause.paths.includes(runtime.path));
}).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [], mode: "Once" }))));
console.log("PNP_CONFIG_PARITY_AND_RESTARTS_OK");
`,
                  resolveDir: fileURLToPath(new URL("../src", import.meta.url)),
                  loader: "ts",
                },
                bundle: true,
                platform: "node",
                format: "esm",
                packages: "external",
                outfile: runner,
                logLevel: "silent",
              }),
            catch: (cause) =>
              new CompilationConfig.DiscoveryFailed({ path: runner, cause }),
          });
          expect(yield* run(["node", runner])).toContain(
            "PNP_CONFIG_PARITY_AND_RESTARTS_OK",
          );
        }).pipe(Effect.scoped, Effect.timeout("60 seconds")),
      { timeout: 65000 },
    );

    it.effect("rejects malformed JSONC instead of evaluating it", () =>
      Effect.gen(function* () {
        const { source } = yield* fixture({
          "src/entry.tsx": entry,
          "tsconfig.json": '{"extends": (() => "./base")()}',
        });
        const result = yield* Effect.result(CompilationConfig.discover(source));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure._tag).toBe("CompilationConfigDiscoveryFailed");
      }).pipe(Effect.scoped),
    );
  },
);
