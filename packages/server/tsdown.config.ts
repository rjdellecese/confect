import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const createConfig = ({
  platform,
  entry,
  outDir,
}: {
  platform: NonNullable<UserConfig["platform"]>;
  entry: NonNullable<UserConfig["entry"]>;
  outDir: NonNullable<UserConfig["outDir"]>;
}): UserConfig => ({
  entry,
  platform,
  outDir,
  clean: true,
  dts: true,
  sourcemap: true,
  format: ["esm"],
  unbundle: true,
});

export default defineConfig([
  createConfig({
    platform: "node",
    entry: ["src/index.ts", "src/**/*.ts"],
    outDir: "dist",
  }),
  createConfig({
    platform: "node",
    entry: ["src/cli/index.ts"],
    outDir: "dist/cli",
  }),
]);
