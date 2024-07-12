import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["./test/setup.ts"],
    typecheck: {
      include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    },
  },
});
