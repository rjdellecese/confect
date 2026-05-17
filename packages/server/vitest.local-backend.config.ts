import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest config for local-backend tests under `test/local-backend/`.
 *
 * These tests own a real Convex local-backend subprocess and assert
 * cache-machinery behavior; they are orders of magnitude slower than the
 * unit and mock-backend suites and are therefore opted into via
 * `pnpm test:local-backend`. The fixture project lives at
 * `test/local-backend/fixtures/` and is regenerated via
 * `pnpm confect codegen` in `globalSetup`.
 */
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
    globalSetup: ["./test/local-backend/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    typecheck: { enabled: false },
    coverage: { enabled: false },
  },
});
