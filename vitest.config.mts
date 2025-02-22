import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 99,
        branches: 99,
        functions: 99,
        lines: 99,
      },
      exclude: [
        ...(configDefaults.coverage?.exclude ?? []),
        "example/**/*",
        "src/**/index.ts",
      ],
    },
    typecheck: {
      include: ["**/*.{test,spec}{-d,}.?(c|m)[jt]s?(x)"],
    },
  },
});
