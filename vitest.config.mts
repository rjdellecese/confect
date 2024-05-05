import * as path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // TODO
  // plugins: [tsconfigPaths()],
  test: {
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    setupFiles: "test/setup.ts",
    alias: {
      "~": path.resolve(__dirname),
    },
  },
});
