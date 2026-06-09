import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Tests import the public package specifiers (`@confect/core/Ref`, …); alias
// them to source so tests exercise `src/` directly instead of built `dist/`.
const packageAliases = ["core", "server", "js", "react", "cli", "test"].flatMap(
  (pkg) => [
    {
      find: new RegExp(`^@confect/${pkg}$`),
      replacement: path.resolve(
        import.meta.dirname,
        `./packages/${pkg}/src/index.ts`,
      ),
    },
    {
      find: new RegExp(`^@confect/${pkg}/(.*)$`),
      replacement: path.resolve(
        import.meta.dirname,
        `./packages/${pkg}/src/$1`,
      ),
    },
  ],
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
