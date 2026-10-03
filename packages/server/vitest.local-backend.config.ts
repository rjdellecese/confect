// oxlint-disable-next-line effecttsgo/node-builtin-import -- Vitest config needs synchronous path resolution before an Effect runtime exists.
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: /^@confect\/server$/,
        replacement: path.resolve(import.meta.dirname, "./src/index.ts"),
      },
      {
        find: /^@confect\/server\/(.*)$/,
        replacement: path.resolve(import.meta.dirname, "./src/$1"),
      },
    ],
  },
  test: {
    root: import.meta.dirname,
    name: "@confect/server (local-backend)",
    include: ["test/local-backend/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.spec.ts"],
    fileParallelism: false,
    globalSetup: ["./test/local-backend/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
