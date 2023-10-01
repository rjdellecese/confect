import { defineConfig } from "vite";

export default defineConfig({
  test: {
    singleThread: true,
    setupFiles: "test/setup.ts",
  },
});
