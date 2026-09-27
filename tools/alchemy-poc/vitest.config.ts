import { defineProject, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "confect-alchemy-poc",
      root: import.meta.dirname,
    },
  }),
);
