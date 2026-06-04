// Measures one generated Confect function entry: minified bundle bytes, raw
// bytes, effect/Schema bytesInOutput, fast-check presence, and median cold-eval.
// Used to compare the barrel-import baseline vs the submodule-import prototype.
//   node src/measure_one.mjs <appDir>

import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as esbuild from "esbuild";
import { builtinModules } from "node:module";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const evalChild = join(here, "evalChild.mjs");
const EXTERNAL = ["convex", "convex/*", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

const appDir = resolve(process.argv[2]);
const entry = join(appDir, "convex", "g0.ts");
const outDir = join(appDir, ".bundles");
await mkdir(outDir, { recursive: true });

async function build(min) {
  const out = join(outDir, min ? "m.mjs" : "r.mjs");
  const r = await esbuild.build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node",
    target: "esnext", minify: min, metafile: true, external: EXTERNAL, logLevel: "silent",
    absWorkingDir: appDir,
  });
  return { out, bytes: (await stat(out)).size, metafile: r.metafile };
}

const minB = await build(true);
const rawB = await build(false);
const ok = Object.keys(rawB.metafile.outputs).find((k) => !k.endsWith(".map"));
const inputs = rawB.metafile.outputs[ok].inputs;
let schema = 0, stream = 0;
let fastCheck = false;
for (const [p, i] of Object.entries(inputs)) {
  if (/effect\/dist\/esm\/Schema\.js$/.test(p)) schema += i.bytesInOutput;
  if (/effect\/dist\/esm\/(Stream|Channel|Sink)\.js$/.test(p) || /internal\/(stream|channel|sink)/.test(p)) stream += i.bytesInOutput;
  if (p.includes("fast-check")) fastCheck = true;
}

const samples = [];
for (let i = 0; i < 25 + 4; i++) {
  const { stdout } = await execFileP("node", [evalChild, minB.out], { env: { ...process.env, NODE_COMPILE_CACHE: "" } });
  if (i >= 4) samples.push(JSON.parse(stdout).ms);
}
samples.sort((a, b) => a - b);
const med = samples[Math.floor(samples.length / 2)];

const k = (x) => (x / 1024).toFixed(1) + " KiB";
console.log(JSON.stringify({
  bundleMin: minB.bytes, bundleRaw: rawB.bytes,
  schemaBytes: schema, streamBytes: stream, fastCheck, evalMs: Math.round(med * 10) / 10,
}));
console.log(`  bundle(min) ${k(minB.bytes)}  raw ${k(rawB.bytes)}  Schema.js ${k(schema)}  Stream/Channel/Sink ${k(stream)}  fast-check=${fastCheck}  cold-eval ${med.toFixed(1)}ms`);
