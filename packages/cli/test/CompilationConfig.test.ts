import * as CompilationConfig from "@confect/cli/CompilationConfig";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as esbuild from "esbuild";

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

const build = (source: string, conditions?: string[]) =>
  Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [source],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
        logLevel: "silent",
        ...(conditions === undefined ? {} : { conditions }),
      }),
    catch: (cause) =>
      new CompilationConfig.DiscoveryFailed({ path: source, cause }),
  });

const entry = "export const node = <div />";
const chosen = '{"compilerOptions":{"jsxFactory":"chosen.h"}}';

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationConfig",
  (it) => {
    const nativeCases: ReadonlyArray<{
      readonly name: string;
      readonly files: Readonly<Record<string, string>>;
      readonly dependencies: ReadonlyArray<string>;
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
        name: "jsconfig discovery",
        files: {
          "jsconfig.json": '{"extends":"./base.custom"}',
          "base.custom": chosen,
        },
        dependencies: ["tsconfig.json", "jsconfig.json", "base.custom"],
      },
      {
        name: "nearest tsconfig overrides parent jsconfig",
        files: {
          "jsconfig.json": '{"extends":"./parent.custom"}',
          "parent.custom": '{"compilerOptions":{"jsxFactory":"parent.h"}}',
          "src/tsconfig.json": chosen,
          "src/jsconfig.json": '{"extends":"./not-read"}',
        },
        dependencies: ["src/tsconfig.json", "jsconfig.json", "parent.custom"],
      },
    ];
    it.effect.each(nativeCases)(
      "matches native esbuild: $name",
      ({ files, dependencies }) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            ...files,
          });
          const discovered = yield* CompilationConfig.discover(source);
          for (const file of dependencies)
            expect(discovered).toContain(path.join(root, file));
          const result = yield* build(source);
          expect(result.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(result.warnings).toHaveLength(0);
        }).pipe(Effect.scoped),
    );

    it.effect.each(
      ["tsconfig.json", "jsconfig.json"].flatMap((configName) =>
        ["config", "extends"].map((malformed) => ({ configName, malformed })),
      ),
    )(
      "rejects a shadowed malformed parent $configName $malformed like native",
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
          const failedName =
            malformed === "config" ? configName : "parent.custom";
          const discovered = yield* Effect.result(
            CompilationConfig.discover(source),
          );
          expect(Result.isFailure(discovered)).toBe(true);
          if (Result.isFailure(discovered))
            expect(discovered.failure).toMatchObject({
              _tag: "CompilationConfigDiscoveryFailed",
              path: path.join(root, failedName),
            });
          const native = yield* Effect.result(build(source));
          expect(Result.isFailure(native)).toBe(true);
          if (Result.isFailure(native))
            expect(native.failure.cause).toMatchObject({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  text: "Unexpected end of file in JSON",
                  location: expect.objectContaining({
                    file: expect.stringContaining(`/${failedName}`),
                  }),
                }),
              ]),
            });
        }).pipe(Effect.scoped),
    );

    it.effect.each(["tsconfig.json", "jsconfig.json"])(
      "observes missing extends from shadowed parent %s because native warns",
      (configName) =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "src/tsconfig.json": chosen,
            [configName]:
              '{"extends":"./parent.custom","compilerOptions":{"jsxFactory":"unused.h"}}',
          });
          const discovered = yield* CompilationConfig.discover(source);
          expect(discovered).toContain(path.join(root, "parent.custom"));
          expect(discovered).toContain(path.join(root, "parent.custom.json"));
          const native = yield* build(source);
          expect(native.outputFiles?.[0]?.text).toContain("chosen.h(");
          expect(native.warnings).toEqual([
            expect.objectContaining({
              text: 'Cannot find base config file "./parent.custom"',
              location: expect.objectContaining({
                file: expect.stringContaining(`/${configName}`),
              }),
            }),
          ]);
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
          const discovered = yield* CompilationConfig.discover(source).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFileString: (file, encoding) => {
                reads.push(file);
                return fs.readFileString(file, encoding);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(
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
          const discovered = yield* CompilationConfig.discover(
            source,
            undefined,
            ["custom"],
          );
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
          const discovered = yield* CompilationConfig.discover(source);
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
          expect(yield* CompilationConfig.discover(source)).toContain(future);
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
          const result = yield* CompilationConfig.discover(
            source,
            (file, kind) =>
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
              readFileString: (file, encoding) =>
                Effect.gen(function* () {
                  expect(baselines.has(file)).toBe(true);
                  return yield* fs.readFileString(file, encoding);
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
          CompilationConfig.discover(source, (file) =>
            Effect.gen(function* () {
              if (mode === "changed-alias" && file === alias) {
                yield* fs.remove(alias);
                yield* fs.symlink(secret, alias);
              }
            }),
          ).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFileString: (file, encoding) => {
                reads.push(file);
                return fs.readFileString(file, encoding);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          expect(yield* CompilationConfig.discover(source)).toContain(
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          const discovered = yield* CompilationConfig.discover(source);
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
          expect(yield* CompilationConfig.discover(source)).toContain(future);
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
            CompilationConfig.discover(source, (file) =>
              Effect.sync(() => {
                observed.push(file);
              }),
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readFileString: (file, encoding) => {
                  read.push(file);
                  return fs.readFileString(file, encoding);
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
          const outcome = yield* Effect.result(
            CompilationConfig.discover(source),
          );
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
          const discovered = yield* CompilationConfig.discover(source);
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
        yield* CompilationConfig.discover(source, (file, kind) =>
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
        expect(yield* CompilationConfig.discover(source)).toContain(
          path.join(root, "base.custom"),
        );
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects Yarn PnP explicitly without evaluating its manifest",
      () =>
        Effect.gen(function* () {
          const { source, root, path } = yield* fixture({
            "src/entry.tsx": entry,
            "tsconfig.json": '{"extends":"fixture"}',
            ".pnp.cjs": "throw new Error('must not execute')",
          });
          const result = yield* Effect.result(
            CompilationConfig.discover(source),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure).toMatchObject({
              path: path.join(root, ".pnp.cjs"),
              reason: "YarnPlugAndPlay",
            });
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
        const discovered = yield* CompilationConfig.discover(source);
        expect(discovered).toContain(path.join(root, "tsconfig.json"));
        if (mode !== "none")
          expect(discovered).toContain(path.join(root, "base.custom"));
        expect((yield* build(source)).outputFiles?.[0]?.text).toContain(
          "chosen.h(",
        );
      }).pipe(Effect.scoped),
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
