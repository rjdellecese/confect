import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const createConfig = ({
  platform,
  entry,
  clean,
  outDir,
}: {
  platform: NonNullable<UserConfig["platform"]>;
  entry: NonNullable<UserConfig["entry"]>;
  clean: NonNullable<UserConfig["clean"]>;
  outDir: NonNullable<UserConfig["outDir"]>;
}): UserConfig => ({
  entry,
  platform,
  clean,
  outDir,
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  format: ["esm", "cjs"],
});

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/server/index.ts"],
    clean: true,
    outDir: "dist/server",
  }),
  createConfig({
    platform: "neutral",
    entry: ["src/api/index.ts"],
    clean: true,
    outDir: "dist/api",
  }),
  createConfig({
    platform: "browser",
    entry: ["src/react/index.ts"],
    clean: true,
    outDir: "dist/react",
  }),
  createConfig({
    platform: "node",
    entry: ["src/cli/index.ts"],
    clean: true,
    outDir: "dist/cli",
  }),
]);
