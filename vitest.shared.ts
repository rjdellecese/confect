import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
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
