import type { UserConfig } from "tsdown";

export const createConfig = ({
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
