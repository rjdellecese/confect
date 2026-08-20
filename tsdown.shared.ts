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
  // Clean only tsdown's own JavaScript artifacts: the .d.ts files in dist are
  // emitted by `tsc -b`, whose incremental tsbuildinfo assumes they persist.
  clean: [
    `${outDir}/**/*.js`,
    `${outDir}/**/*.mjs`,
    `${outDir}/**/*.js.map`,
    `${outDir}/**/*.mjs.map`,
  ],
  dts: false,
  sourcemap: true,
  format: ["esm"],
  unbundle: true,
});
