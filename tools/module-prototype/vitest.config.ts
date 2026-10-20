import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@confect\/cli\/(.*)$/,
        replacement: new URL("../../packages/cli/src/$1", import.meta.url)
          .pathname,
      },
    ],
  },
  test: {
    root: import.meta.dirname,
    include: ["test/**/*.test.ts"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
