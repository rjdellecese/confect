import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { configDefaults, defineConfig } from "vitest/config";

// Tests import the public package specifiers (`@confect/core/Ref`, …); alias
// them to source so tests exercise `src/` directly instead of built `dist/`.
//
// Discover the workspace packages instead of listing them, so the alias set
// can't go stale as packages are added or removed. A `src/index.ts` is what
// marks a directory as an aliasable package; its specifier comes from the
// package's own `name`.
const discoverPackageAliases = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const packagesDir = path.resolve(import.meta.dirname, "packages");

  return yield* Effect.forEach(yield* fs.readDirectory(packagesDir), (entry) =>
    Effect.gen(function* () {
      const srcDir = path.join(packagesDir, entry, "src");

      if (!(yield* fs.exists(path.join(srcDir, "index.ts")))) {
        return [];
      }

      const manifest = yield* fs.readFileString(
        path.join(packagesDir, entry, "package.json"),
      );
      const { name } = yield* Effect.try(
        () => JSON.parse(manifest) as { name: string },
      );

      return [
        {
          find: new RegExp(`^${name}$`),
          replacement: path.join(srcDir, "index.ts"),
        },
        {
          find: new RegExp(`^${name}/(.*)$`),
          replacement: path.join(srcDir, "$1"),
        },
      ];
    }),
  ).pipe(Effect.map((aliases) => aliases.flat()));
});

const packageAliases = await discoverPackageAliases.pipe(
  Effect.provide(NodeContext.layer),
  Effect.runPromise,
);

export default defineConfig({
  resolve: {
    alias: packageAliases,
  },
  test: {
    exclude: [...configDefaults.exclude, "**/*.spec.ts"],
    typecheck: {
      enabled: true,
      include: ["test/**/*.test.ts"],
    },
    coverage: {
      enabled: true,
      exclude: [
        "tsdown.config.ts",
        "vitest.config.ts",
        "src/index.ts",
        "coverage/**/*",
        "dist/**/*",
        "test/**/*",
      ],
    },
  },
});
