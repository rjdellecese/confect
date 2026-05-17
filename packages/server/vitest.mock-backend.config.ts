import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

/**
 * Vitest config for in-process backend tests under `test/mock-backend/`.
 *
 * These tests drive Confect functions through `convex-test`'s in-memory
 * mock backend (no `convex dev` subprocess) and are still fast enough to
 * run alongside the unit suite during normal development. The fixture
 * project lives at `test/mock-backend/fixtures/` and is regenerated via
 * `pnpm confect codegen` in `globalSetup`.
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
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
      name: "@confect/server (mock-backend)",
      include: ["test/mock-backend/**/*.test.ts"],
      globalSetup: ["./test/mock-backend/setup.ts"],
    },
  }),
);
