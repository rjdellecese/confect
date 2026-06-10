import fs from "node:fs";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Tests import the public package specifiers (`@confect/core/Ref`, …); alias
// them to source so tests exercise `src/` directly instead of built `dist/`.
//
// Discover the workspace packages instead of listing them, so the alias set
// can't go stale as packages are added or removed. A `src/index.ts` is what
// marks a directory as an aliasable package; its specifier comes from the
// package's own `name`.
const packagesDir = path.resolve(import.meta.dirname, "packages");

const packageAliases = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      fs.existsSync(path.join(packagesDir, entry.name, "src/index.ts")),
  )
  .flatMap((entry) => {
    const srcDir = path.join(packagesDir, entry.name, "src");
    const { name } = JSON.parse(
      fs.readFileSync(
        path.join(packagesDir, entry.name, "package.json"),
        "utf8",
      ),
    ) as { name: string };

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
  });

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
