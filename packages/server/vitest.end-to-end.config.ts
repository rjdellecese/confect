import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest config for end-to-end tests under `test/end-to-end/`.
 *
 * These tests own a real Convex local-backend subprocess and assert
 * cache-machinery behavior; they are orders of magnitude slower than the
 * default in-process suite (`vitest.config.ts`) and are therefore opted
 * into via `pnpm test:end-to-end`.
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
    name: "@confect/server (end-to-end)",
    include: ["test/end-to-end/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.spec.ts"],
    // No globalSetup: end-to-end tests own their own backend lifecycle in
    // each describe block's beforeAll/afterAll.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Disable typecheck (it would re-enter the default config's discovery).
    typecheck: { enabled: false },
    // Disable coverage for e2e since it slows things down and we already
    // measure coverage from the fast suite.
    coverage: { enabled: false },
  },
});
