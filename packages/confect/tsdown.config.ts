import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const createConfig = ({
  platform,
  entry,
  clean,
}: {
  platform: UserConfig["platform"];
  entry: UserConfig["entry"];
  clean: UserConfig["clean"];
}): UserConfig => ({
  entry,
  platform,
  clean,
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  format: ["esm", "cjs"],
});

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/server/index.ts", "src/api/index.ts"],
    clean: true,
  }),
  createConfig({
    platform: "browser",
    entry: ["src/react/index.ts"],
    clean: false,
  }),
  createConfig({ platform: "node", entry: ["src/cli/index.ts"], clean: false }),
]);
