// Bundles a single `convex/{path}.ts` entry the way Convex bundles function
// modules: ESM, externalize the `convex` package and Node built-ins, bundle
// everything else (including `@confect/*` and `effect`). The output byte size is
// our proxy for the per-function cold-start bundle a Convex isolate must parse.
//
// We bundle with platform:"node" because metric B re-imports the output in Node;
// `convex` and node built-ins stay external (referenced, not inlined) exactly as
// in a real Convex deployment. The same options are applied to both the vanilla
// and Confect apps, so the comparison is apples-to-apples.

import { builtinModules } from "node:module";
import { stat } from "node:fs/promises";
import * as esbuild from "esbuild";

const EXTERNAL = [
  "convex",
  "convex/*",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export async function bundle(entry, outfile, { minify }) {
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "esnext",
    minify,
    metafile: true,
    external: EXTERNAL,
    logLevel: "silent",
    absWorkingDir: process.cwd(),
  });
  const { size } = await stat(outfile);
  return { bytes: size, metafile: result.metafile };
}
