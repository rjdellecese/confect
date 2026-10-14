import { pathToFileURL } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Console from "effect/Console";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Bundler from "@confect/cli/Bundler";

const BundlerLayer = Layer.mergeAll(NodePath.layer, NodeFileSystem.layer);

const tsconfigContents = JSON.stringify(
  {
    compilerOptions: {
      moduleResolution: "Bundler",
      paths: { "~/*": ["./*"] },
    },
  },
  null,
  2,
);

layer(BundlerLayer)("bundle", (it) => {
  it.effect(
    "bundles imports that resolve through tsconfig path aliases (regression for 9.0.0-next.4)",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        yield* fs.writeFileString(
          path.join(tempDir, "tsconfig.json"),
          tsconfigContents,
        );
        yield* fs.writeFileString(
          path.join(tempDir, "sibling.ts"),
          `export const value = "bundled";\n`,
        );
        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(
          entry,
          `import { value } from "~/sibling";\nexport default value;\n`,
        );

        const bundled = yield* Bundler.bundle(entry);
        expect(bundled.module.default).toBe("bundled");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "bundles first-party workspace deps whose dist uses extensionless relative imports",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        const pkgDir = path.join(tempDir, "pkg");
        yield* fs.makeDirectory(path.join(pkgDir, "dist", "Scenario"), {
          recursive: true,
        });
        yield* fs.writeFileString(
          path.join(pkgDir, "package.json"),
          `{ "name": "@scope/lib", "type": "module", "exports": { "./Scenario": "./dist/Scenario.js" } }\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Scenario.js"),
          `export { value } from "./Scenario/Inner";\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Scenario", "Inner.js"),
          `export const value = "bundled";\n`,
        );

        // Symlink into node_modules the way pnpm/npm/yarn link a workspace dep;
        // realpath must follow it back to `pkg/` to recognize it as first-party.
        yield* fs.makeDirectory(path.join(tempDir, "node_modules", "@scope"), {
          recursive: true,
        });
        yield* fs.symlink(
          pkgDir,
          path.join(tempDir, "node_modules", "@scope", "lib"),
        );

        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(
          entry,
          `import { value } from "@scope/lib/Scenario";\nexport default value;\n`,
        );

        const bundled = yield* Bundler.bundle(entry);
        expect(bundled.module.default).toBe("bundled");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "bundles first-party workspace deps whose exports declare only the import condition",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        const pkgDir = path.join(tempDir, "pkg");
        yield* fs.makeDirectory(path.join(pkgDir, "dist", "Widget"), {
          recursive: true,
        });
        // Conditional `exports` with only `import`/`types`—no
        // `require`/`default`. CommonJS resolution (`createRequire`) throws
        // ERR_PACKAGE_PATH_NOT_EXPORTED for this shape, so it only bundles
        // once resolution honors the ESM `import` condition.
        yield* fs.writeFileString(
          path.join(pkgDir, "package.json"),
          `{ "name": "@scope/esm-lib", "type": "module", "exports": { "./*": { "types": "./dist/*.d.ts", "import": "./dist/*.js" } } }\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Widget.js"),
          `export { value } from "./Widget/Inner";\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Widget", "Inner.js"),
          `export const value = "bundled";\n`,
        );

        yield* fs.makeDirectory(path.join(tempDir, "node_modules", "@scope"), {
          recursive: true,
        });
        yield* fs.symlink(
          pkgDir,
          path.join(tempDir, "node_modules", "@scope", "esm-lib"),
        );

        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(
          entry,
          `import { value } from "@scope/esm-lib/Widget";\nexport default value;\n`,
        );

        const bundled = yield* Bundler.bundle(entry);
        expect(bundled.module.default).toBe("bundled");
      }).pipe(Effect.scoped),
  );

  it.effect("keeps true third-party node_modules deps external", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Entry lives under the repo so the externalized `effect` resolves from
      // the temp `.mjs` (externals load relative to it, not bundled).
      const tempDir = yield* fs.makeTempDirectoryScoped({
        directory: process.cwd(),
      });

      const entry = path.join(tempDir, "entry.ts");
      yield* fs.writeFileString(
        entry,
        `import { pipe } from "effect/Function";\nexport default pipe(1, (n) => n + 1);\n`,
      );

      const bundled = yield* Bundler.bundle(entry);
      expect(bundled.module.default).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "rewrites import.meta.url inside the bundle to the original source path",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(entry, `export default import.meta.url;\n`);

        const bundled = yield* Bundler.bundle(entry);
        // esbuild canonicalizes `import.meta.url` to the entry's real path, so
        // resolve symlinks before comparing—otherwise this fails when the
        // temp dir lives under a symlinked root (e.g. macOS `/tmp` ->
        // `/private/tmp`).
        const realEntry = yield* fs.realPath(entry);
        expect(bundled.module.default).toBe(pathToFileURL(realEntry).href);
      }).pipe(Effect.scoped),
  );
});

layer(BundlerLayer)("importersOfPackage", (it) => {
  // The two shapes `@confect/server` takes in the wild: externalized in a
  // published install, bundled in this monorepo (a symlinked workspace dep whose
  // realpath is outside `node_modules`). Matching on the resolved path would
  // only ever catch one of them, so the lookup reads the original specifier.
  it.effect("finds an importer of an externalized package", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Under the repo so the externalized `effect` resolves from the temp
      // `.mjs` that `bundle-require` writes beside the entry.
      const tempDir = yield* fs.makeTempDirectoryScoped({
        directory: process.cwd(),
      });

      const entry = path.join(tempDir, "entry.ts");
      yield* fs.writeFileString(
        entry,
        `import { pipe } from "effect/Function";\nexport default pipe(1, (n) => n + 1);\n`,
      );

      const bundled = yield* Bundler.bundle(entry);

      expect(
        Bundler.importersOfPackage(bundled, "effect", () => true),
      ).toStrictEqual([yield* fs.realPath(entry)]);
    }).pipe(Effect.scoped),
  );

  it.effect("finds an importer of a bundled workspace package", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped();

      const pkgDir = path.join(tempDir, "pkg");
      yield* fs.makeDirectory(path.join(pkgDir, "dist"), { recursive: true });
      yield* fs.writeFileString(
        path.join(pkgDir, "package.json"),
        `{ "name": "@scope/lib", "type": "module", "exports": { ".": "./dist/index.js" } }\n`,
      );
      yield* fs.writeFileString(
        path.join(pkgDir, "dist", "index.js"),
        `export const value = "bundled";\n`,
      );

      yield* fs.makeDirectory(path.join(tempDir, "node_modules", "@scope"), {
        recursive: true,
      });
      yield* fs.symlink(
        pkgDir,
        path.join(tempDir, "node_modules", "@scope", "lib"),
      );

      const entry = path.join(tempDir, "entry.ts");
      yield* fs.writeFileString(
        entry,
        `import { value } from "@scope/lib";\nexport default value;\n`,
      );

      const bundled = yield* Bundler.bundle(entry);

      // The import resolved to an absolute path inside `pkg/dist`, yet the
      // package is still found by name. Canonicalize the returned path because
      // macOS exposes the same temporary directory through both `/var` and
      // `/private/var`.
      const importers = Bundler.importersOfPackage(
        bundled,
        "@scope/lib",
        () => true,
      );
      expect(
        yield* Effect.forEach(importers, (importer) => fs.realPath(importer)),
      ).toStrictEqual([yield* fs.realPath(entry)]);
    }).pipe(Effect.scoped),
  );

  it.effect("matches subpath imports and honours the `where` filter", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped({
        directory: process.cwd(),
      });

      // Only the sibling imports `effect/*`; the entry re-exports it.
      const sibling = path.join(tempDir, "sibling.ts");
      yield* fs.writeFileString(
        sibling,
        `import { pipe } from "effect/Function";\nexport default pipe(1, (n) => n + 1);\n`,
      );
      const entry = path.join(tempDir, "entry.ts");
      yield* fs.writeFileString(
        entry,
        `export { default } from "./sibling";\n`,
      );

      const bundled = yield* Bundler.bundle(entry);
      const realSibling = yield* fs.realPath(sibling);

      expect(
        Bundler.importersOfPackage(bundled, "effect", () => true),
      ).toStrictEqual([realSibling]);
      expect(
        Bundler.importersOfPackage(
          bundled,
          "effect",
          (absolutePath) => absolutePath !== realSibling,
        ),
      ).toStrictEqual([]);
    }).pipe(Effect.scoped),
  );
});

const fixture = Effect.fn("Bundler.test.fixture")(function* (
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped();
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(directory, name);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, contents);
  }
  return {
    directory,
    fs,
    path,
    file: (name: string) => path.join(directory, name),
  };
});

layer(BundlerLayer)("withBatch", (it) => {
  it.effect("does not touch unused entries and preserves the inner error", () =>
    Effect.gen(function* () {
      expect(
        yield* Bundler.withBatch(["/missing/entry.ts"], Effect.succeed(42)),
      ).toBe(42);
      const failure = yield* Bundler.withBatch(
        ["/missing/entry.ts"],
        Effect.fail("inner failure"),
      ).pipe(Effect.result);
      expect(failure).toEqual(Result.fail("inner failure"));
    }),
  );

  it.effect(
    "shares dependency evaluation across concurrent callers and isolates each input graph",
    () =>
      Effect.gen(function* () {
        const { file, fs } = yield* fixture({
          "shared.ts":
            "export const state = { count: 0 }; export const next = () => ++state.count;",
          "first.ts":
            'import { state, next } from "./shared"; export { state }; export const count = next();',
          "nested/second.ts":
            'import { state, next } from "../shared"; export { state }; export const count = next(); export { platform } from "./server";',
          "nested/server.ts": 'export { platform } from "node:os";',
        });
        const entries = [file("first.ts"), file("nested/second.ts")] as const;
        const [first, second] = yield* Bundler.withBatch(
          entries,
          Effect.all([Bundler.bundle(entries[0]), Bundler.bundle(entries[1])], {
            concurrency: 4,
          }),
        );
        expect(first.module.state).toBe(second.module.state);
        expect(
          [first.module.count, second.module.count].sort((a, b) => a - b),
        ).toEqual([1, 2]);
        expect(Object.keys(first.metafile.inputs).sort()).toEqual(
          [
            yield* fs.realPath(file("first.ts")),
            yield* fs.realPath(file("shared.ts")),
          ].sort(),
        );
        expect(
          Bundler.importersOfPackage(first, "node:os", () => true),
        ).toEqual([]);
        expect(
          Bundler.importersOfPackage(second, "node:os", () => true),
        ).toEqual([yield* fs.realPath(file("nested/server.ts"))]);
        expect(
          yield* Bundler.directlyImports(
            first,
            file("first.ts"),
            file("shared.ts"),
          ),
        ).toBe(true);
        expect(
          yield* Bundler.directlyImports(
            first,
            file("first.ts"),
            file("nested/server.ts"),
          ),
        ).toBe(false);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "keeps evaluation ordered by callers and removes all artifacts when the batch closes",
    () =>
      Effect.gen(function* () {
        const { file, fs, path } = yield* fixture({
          "shared.ts": "export const value = {};",
          "first.ts": 'export { value } from "./shared";',
          "second.ts":
            'export { value } from "./shared"; throw new Error("second evaluated");',
        });
        const artifacts = yield* Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Effect.gen(function* () {
            const first = yield* Bundler.bundle(file("first.ts"));
            const outputs = Object.keys(first.metafile.outputs);
            expect(
              outputs.some((output) =>
                path.basename(output).startsWith("chunk-"),
              ),
            ).toBe(true);
            for (const output of outputs)
              expect(yield* fs.exists(output)).toBe(true);
            const second = yield* Bundler.bundle(file("second.ts")).pipe(
              Effect.result,
            );
            expect(Result.isFailure(second)).toBe(true);
            if (Result.isFailure(second))
              expect(second.failure.cause).toMatchObject({
                message: "second evaluated",
              });
            return outputs;
          }),
        );
        for (const output of artifacts)
          expect(yield* fs.exists(path.dirname(output))).toBe(false);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "preserves aliases, workspace symlinks, CJS and original source locations",
    () =>
      Effect.gen(function* () {
        const { file, fs, path } = yield* fixture({
          "tsconfig.json": tsconfigContents,
          "package.json": '{ "type": "module" }',
          "pkg/package.json":
            '{ "name": "@fixture/lib", "type": "module", "exports": { ".": { "import": "./index.js" } } }',
          "pkg/index.js": 'export { value } from "./inner";',
          "pkg/inner.js": 'export const value = "workspace";',
          "shared.ts":
            'import { value } from "@fixture/lib"; import cjs from "./value.cjs"; export const data = [value, cjs, import.meta.url, __filename, __dirname];',
          "value.cjs": 'module.exports = require("./local.cjs");',
          "local.cjs": 'module.exports = "commonjs";',
          "first.ts": 'export { data } from "~/shared";',
          "nested/second.ts": 'export { data } from "~/shared";',
        });
        yield* fs.makeDirectory(file("node_modules/@fixture"), {
          recursive: true,
        });
        yield* fs.symlink(file("pkg"), file("node_modules/@fixture/lib"));
        const original = yield* Bundler.bundle(file("first.ts"));
        const [first, second] = yield* Bundler.withBatch(
          [file("first.ts"), file("nested/second.ts")],
          Effect.all([
            Bundler.bundle(file("first.ts")),
            Bundler.bundle(file("nested/second.ts")),
          ]),
        );
        expect(first.module.data).toEqual(original.module.data);
        expect(first.module.data).toBe(second.module.data);
        const source = yield* fs.realPath(file("shared.ts"));
        expect(first.module.data).toEqual([
          "workspace",
          "commonjs",
          pathToFileURL(source).href,
          source,
          path.dirname(source),
        ]);
        expect(
          Bundler.importersOfPackage(first, "@fixture/lib", () => true),
        ).toEqual([source]);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "resolves external packages from nested source locations with ESM conditions",
    () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "first.ts":
            'import value from "dependency"; export { shared } from "./shared"; export default value;',
          "nested/second.ts":
            'import value from "dependency"; export { shared } from "../shared"; export default value;',
          "shared.ts": "export const shared = {};",
          "node_modules/dependency/package.json":
            '{ "type": "module", "exports": { "import": "./index.js" } }',
          "node_modules/dependency/index.js": 'export default "root";',
          "nested/node_modules/dependency/package.json":
            '{ "type": "module", "exports": { "import": "./index.js" } }',
          "nested/node_modules/dependency/index.js": 'export default "nested";',
        });
        const originals = yield* Effect.all([
          Bundler.bundle(file("first.ts")),
          Bundler.bundle(file("nested/second.ts")),
        ]);
        const batch = yield* Bundler.withBatch(
          [file("first.ts"), file("nested/second.ts")],
          Effect.all([
            Bundler.bundle(file("first.ts")),
            Bundler.bundle(file("nested/second.ts")),
          ]),
        );
        expect(batch.map((entry) => entry.module.default)).toEqual(
          originals.map((entry) => entry.module.default),
        );
        expect(batch.map((entry) => entry.module.default)).toEqual([
          "root",
          "nested",
        ]);
        expect(batch[0].module.shared).toBe(batch[1].module.shared);
        expect(
          Bundler.importersOfPackage(batch[1], "dependency", () => true),
        ).toHaveLength(1);
      }).pipe(Effect.scoped),
  );

  it.effect.each(["development", "module-sync", "node-addons"] as const)(
    "preserves the native %s condition when resolving external exports",
    (condition) =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "first.ts":
            'export { default } from "conditional"; export { shared } from "./shared";',
          "second.ts":
            'export { default } from "conditional"; export { shared } from "./shared";',
          "shared.ts": "export const shared = {};",
          "node_modules/conditional/package.json": `{ "type": "module", "exports": { "${condition}": "./conditional.js", "default": "./default.js" } }`,
          "node_modules/conditional/conditional.js": `export default "${condition}";`,
          "node_modules/conditional/default.js": 'export default "default";',
        });
        const original = yield* Bundler.bundle(file("first.ts"));
        const [first, second] = yield* Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Effect.all([
            Bundler.bundle(file("first.ts")),
            Bundler.bundle(file("second.ts")),
          ]),
        );
        expect(first.module.default).toBe(original.module.default);
        expect(first.module.shared).toBe(second.module.shared);
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    "--conditions=custom",
    '-C "custom condition"',
    "--no-addons",
  ])("falls back for condition-bearing NODE_OPTIONS: %s", (nodeOptions) =>
    Effect.gen(function* () {
      const { file } = yield* fixture({
        "first.ts": 'export { shared } from "./shared";',
        "second.ts": 'export { shared } from "./shared";',
        "shared.ts": "export const shared = {};",
      });
      const [first, second] = yield* Bundler.withBatch(
        [file("first.ts"), file("second.ts")],
        Effect.all([
          Bundler.bundle(file("first.ts")),
          Bundler.bundle(file("second.ts")),
        ]),
      ).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ NODE_OPTIONS: nodeOptions }),
          ),
        ),
      );
      expect(first.module.shared).not.toBe(second.module.shared);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "falls back on mixed tsconfigs without changing alias resolution",
    () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "tsconfig.json": tsconfigContents,
          "shared.ts": 'export const value = "root";',
          "first.ts": 'export { value } from "~/shared";',
          "nested/tsconfig.json": tsconfigContents,
          "nested/shared.ts": 'export const value = "nested";',
          "nested/second.ts": 'export { value } from "~/shared";',
        });
        const entries = yield* Bundler.withBatch(
          [file("first.ts"), file("nested/second.ts")],
          Effect.all([
            Bundler.bundle(file("first.ts")),
            Bundler.bundle(file("nested/second.ts")),
          ]),
        );
        expect(entries.map((entry) => entry.module.value)).toEqual([
          "root",
          "nested",
        ]);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "falls back after a failed build and reports only the requested entry's error",
    () =>
      Effect.gen(function* () {
        const { file, fs } = yield* fixture({
          "first.ts": 'export const value = "valid";',
          "broken.ts": "export const value = ;",
        });
        yield* Bundler.withBatch(
          [file("first.ts"), file("broken.ts")],
          Effect.gen(function* () {
            expect((yield* Bundler.bundle(file("first.ts"))).module.value).toBe(
              "valid",
            );
            const broken = yield* Bundler.bundle(file("broken.ts")).pipe(
              Effect.result,
            );
            expect(Result.isFailure(broken)).toBe(true);
            if (Result.isFailure(broken))
              expect(broken.failure.cause).toMatchObject({
                errors: [
                  expect.objectContaining({
                    location: expect.objectContaining({ file: "broken.ts" }),
                  }),
                ],
              });
            yield* fs.writeFileString(
              file("broken.ts"),
              'export const value = "fixed";',
            );
            expect(
              (yield* Bundler.bundle(file("broken.ts"))).module.value,
            ).toBe("fixed");
          }),
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "does not batch custom plugin calls or entries outside the batch",
    () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "first.ts": 'export const value = "first";',
          "second.ts": 'export const value = "second";',
          "outside.ts": 'export const value = "outside";',
        });
        yield* Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Effect.gen(function* () {
            const custom = yield* Bundler.bundle(file("first.ts"), {
              plugins: [
                {
                  name: "replace-entry",
                  setup(build) {
                    build.onLoad({ filter: /first\.ts$/ }, () => ({
                      contents: 'export const value = "custom";',
                      loader: "ts",
                    }));
                  },
                },
              ],
            });
            expect(custom.module.value).toBe("custom");
            expect((yield* Bundler.bundle(file("first.ts"))).module.value).toBe(
              "first",
            );
            expect(
              (yield* Bundler.bundle(file("outside.ts"))).module.value,
            ).toBe("outside");
          }),
        );
      }).pipe(Effect.scoped),
  );

  it.effect("recompiles edited dependencies in a fresh batch", () =>
    Effect.gen(function* () {
      const { file, fs } = yield* fixture({
        "shared.ts": 'export const value = "before";',
        "first.ts": 'export { value } from "./shared";',
        "second.ts": 'export { value } from "./shared";',
      });
      const load = () =>
        Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Bundler.bundle(file("first.ts")),
        );
      expect((yield* load()).module.value).toBe("before");
      yield* fs.writeFileString(
        file("shared.ts"),
        'export const value = "after";',
      );
      expect((yield* load()).module.value).toBe("after");
    }).pipe(Effect.scoped),
  );

  it.effect(
    "logs warnings only for the requested entry's reachable sources",
    () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "first.ts": 'export const value = "clean";',
          "second.ts": 'export { default } from "./warning";',
          "warning.ts": "export default { duplicate: 1, duplicate: 2 };",
        });
        const messages: unknown[] = [];
        const console = yield* Console.Console;
        yield* Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Effect.gen(function* () {
            yield* Bundler.bundle(file("first.ts"));
            expect(messages).toEqual([]);
            yield* Bundler.bundle(file("second.ts"));
            expect(messages).toHaveLength(1);
            expect(messages.join("\n")).toContain("Duplicate key");
            expect(messages.join("\n")).toContain("warning.ts");
          }),
        ).pipe(
          Effect.provideService(
            Console.Console,
            Object.assign(Object.create(console), {
              error: (...args: ReadonlyArray<unknown>) => {
                messages.push(...args);
              },
            }),
          ),
        );
      }).pipe(Effect.scoped),
  );

  it.effect.each(["failure", "interruption"] as const)(
    "cleans temporary chunks on %s",
    (mode) =>
      Effect.gen(function* () {
        const { file, fs } = yield* fixture({
          "first.ts": 'export { value } from "./shared";',
          "second.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = {};",
        });
        const directories: string[] = [];
        const exit = yield* Bundler.withBatch(
          [file("first.ts"), file("second.ts")],
          Effect.gen(function* () {
            yield* Bundler.bundle(file("first.ts"));
            return yield* mode === "failure"
              ? Effect.fail("failed")
              : Effect.interrupt;
          }),
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            makeTempDirectoryScoped: (options) =>
              fs.makeTempDirectoryScoped(options).pipe(
                Effect.tap((directory) =>
                  Effect.sync(() => {
                    directories.push(directory);
                  }),
                ),
              ),
          }),
          Effect.exit,
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(directories).toHaveLength(1);
        for (const directory of directories)
          expect(yield* fs.exists(directory)).toBe(false);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "preserves source-relative dynamic require and lazy dynamic imports",
    () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "shared.ts":
            'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); export const load = (name) => require(name); export const lazy = () => import("./lazy");',
          "value.cjs": 'module.exports = "dynamic";',
          "lazy.ts": 'export default "lazy";',
          "first.ts": 'export { load, lazy } from "./shared";',
          "nested/second.ts": 'export { load, lazy } from "../shared";',
        });
        const original = yield* Bundler.bundle(file("first.ts"));
        yield* Bundler.withBatch(
          [file("first.ts"), file("nested/second.ts")],
          Effect.gen(function* () {
            const first = yield* Bundler.bundle(file("first.ts"));
            const second = yield* Bundler.bundle(file("nested/second.ts"));
            expect(first.module.load("./value.cjs")).toBe(
              original.module.load("./value.cjs"),
            );
            expect(first.module.load).toBe(second.module.load);
            const lazy = yield* Effect.promise(() => first.module.lazy());
            expect(lazy).toMatchObject({ default: "lazy" });
          }),
        );
      }).pipe(Effect.scoped),
  );
});
