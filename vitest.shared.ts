import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      include: ["test/**/*.test.ts"],
    },
    coverage: {
      enabled: true,
      thresholds: {
        "100": true,
      },
      exclude: [
        "tsdown.config.ts",
        "vitest.config.ts",
        "src/index.ts",
        "dist/**/*",
      ],
    },
  },
});
