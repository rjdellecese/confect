import { defineConfig } from "tsdown";
import { createConfig } from "../../tsdown.shared";

export default defineConfig(
  createConfig({
    platform: "node",
    entry: ["src/index.ts"],
    outDir: "dist",
  }),
);
