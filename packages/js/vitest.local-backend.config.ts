import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      root: import.meta.dirname,
      name: "@confect/js (local-backend)",
      include: ["test/local-backend/**/*.test.ts"],
      fileParallelism: false,
      globalSetup: ["../server/test/local-backend/setup.ts"],
      testTimeout: 60_000,
      hookTimeout: 120_000,
      typecheck: { enabled: false },
      coverage: { enabled: false },
    },
  }),
);
