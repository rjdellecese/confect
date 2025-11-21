import { defineConfig } from "tsdown";

const createConfig = ({
  platform,
  entry,
  clean,
}: {
  platform: "neutral" | "node" | "browser";
  entry: string[];
  clean: boolean;
}) => ({
  entry,
  platform,
  clean,
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
});

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/server/index.ts", "src/api/index.ts"],
    clean: true,
  }),
  createConfig({
    platform: "browser",
    entry: ["src/react/**/*.ts"],
    clean: false,
  }),
  createConfig({ platform: "node", entry: ["src/cli/index.ts"], clean: false }),
]);
