import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

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
      include: ["test/**/*.test.ts"],
      // End-to-end tests live in `test/end-to-end/` and require a real
      // Convex local backend. They are run via `pnpm test:end-to-end` against
      // `vitest.end-to-end.config.ts` instead of the default fast suite.
      exclude: ["test/end-to-end/**"],
      globalSetup: ["./test/setup.ts"],
    },
  }),
);
