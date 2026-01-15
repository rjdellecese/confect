import { defineConfig } from "tsdown";
import { createConfig } from "../../tsdown.shared";

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/index.ts", "src/**/*.ts", "!src/cli/**/*"],
    outDir: "dist",
  }),
  createConfig({
    platform: "node",
    entry: ["src/cli/index.ts"],
    outDir: "dist/cli",
  }),
]);
