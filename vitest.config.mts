import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      enabled: true,
      thresholds: { "100": true },
    },
    typecheck: {
      include: ["**/*.{test,spec}{-d,}.?(c|m)[jt]s?(x)"],
    },
  },
});
