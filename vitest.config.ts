import { defineConfig } from "vitest/config";
import { coverage } from "./vitest.coverage";

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "tools/oxlint-rules/vitest.config.ts",
    ],
    coverage: { ...coverage, enabled: false },
  },
});
