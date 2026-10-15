import { defineConfig } from "tsdown";
import { createConfig } from "../../tsdown.shared";

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/**/*.ts"],
    outDir: "dist",
  }),
]);
