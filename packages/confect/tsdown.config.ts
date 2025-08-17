import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/server/index.ts", "src/react/**/*.{ts,tsx}"],
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
});
