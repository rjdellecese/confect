import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "tools/oxlint-rules", "tools/alchemy-poc"],
  },
});
