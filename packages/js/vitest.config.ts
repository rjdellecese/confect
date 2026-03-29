import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@confect\/js$/,
          replacement: path.resolve(import.meta.dirname, "./src/index.ts"),
        },
      ],
    },
    test: {
      root: import.meta.dirname,
      include: ["test/**/*.test.ts"],
    },
  }),
);
