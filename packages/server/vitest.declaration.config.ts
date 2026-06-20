import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

// The declaration-emit snapshot builds a full TypeScript program over the
// package source, so it lives in its own project (run via `test:declarations`)
// rather than weighing down the default unit suite.
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
      name: "@confect/server (declarations)",
      include: ["test/declaration/**/*.test.ts"],
      // A plain runtime snapshot — no type-level assertions to typecheck, and
      // coverage of the test harness is meaningless.
      typecheck: { enabled: false },
      coverage: { enabled: false },
    },
  }),
);
