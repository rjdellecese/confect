import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: "@confect/alchemy",
      root: import.meta.dirname,
      include: ["test/**/*.test.ts"],
    },
  }),
);
