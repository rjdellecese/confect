import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const createConfig = ({
  platform,
  entry,
  clean,
  outDir,
  external,
}: {
  platform: NonNullable<UserConfig["platform"]>;
  entry: NonNullable<UserConfig["entry"]>;
  clean: NonNullable<UserConfig["clean"]>;
  outDir: NonNullable<UserConfig["outDir"]>;
  external?: NonNullable<UserConfig["external"]>;
}): UserConfig => ({
  entry,
  platform,
  clean,
  outDir,
  dts: {
    sourcemap: true,
    resolver: "tsc",
  },
  sourcemap: true,
  unbundle: true,
  format: ["esm", "cjs"],
  ...(external ? { external } : {}),
});

export default defineConfig([
  createConfig({
    platform: "neutral",
    entry: ["src/server/index.ts"],
    clean: true,
    outDir: "dist/server",
    external: ["@rjdellecese/confect/api"],
  }),
  createConfig({
    platform: "neutral",
    entry: ["src/api/index.ts"],
    clean: true,
    outDir: "dist/api",
  }),
  createConfig({
    platform: "browser",
    entry: ["src/client/index.ts"],
    clean: true,
    outDir: "dist/client",
    external: ["@rjdellecese/confect/api"],
  }),
  createConfig({
    platform: "node",
    entry: ["src/cli/index.ts"],
    clean: true,
    outDir: "dist/cli",
    external: ["@rjdellecese/confect/api"],
  }),
]);
