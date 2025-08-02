import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      exclude: [
        ...(configDefaults.coverage?.exclude ?? []),
        "example/**/*",
        "src/**/index.ts",
        "tsdown.config.ts",
      ],
    },
    typecheck: {
      include: ["**/*.{test,spec}{-d,}.?(c|m)[jt]s?(x)"],
    },
  },
});
