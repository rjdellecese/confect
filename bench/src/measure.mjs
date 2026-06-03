// Per-cell measurement: codegen (Confect only) -> esbuild bundle (metric A:
// bytes) -> fresh-process module eval (metric B: ms). Returns one row per
// sampled function entry. Functions within a cell are structurally identical,
// so a small sample faithfully represents per-function cost while bounding
// runtime on large cells.

import { execFile } from "node:child_process";
import { readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "./esbuildBundle.mjs";
import { REPS_EVAL, WARMUP, SAMPLE } from "./config.mjs";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const cliPath = join(repoRoot, "packages", "cli", "dist", "index.mjs");
const evalChild = join(here, "evalChild.mjs");

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const sample = (arr, n) => {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
};

async function listFunctionEntries(appDir) {
  const convexDir = join(appDir, "convex");
  const files = await readdir(convexDir);
  return files
    .filter((f) => /^g\d+\.ts$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => join(convexDir, f));
}

async function evalCold(bundlePath) {
  const samples = [];
  for (let i = 0; i < WARMUP + REPS_EVAL; i++) {
    const { stdout } = await execFileP("node", [evalChild, bundlePath], {
      env: { ...process.env, NODE_COMPILE_CACHE: "" },
    });
    const { ms } = JSON.parse(stdout);
    if (i >= WARMUP) samples.push(ms);
  }
  return samples;
}

export async function measureCell(cell, appDir, outDir) {
  if (cell.version === "confect") {
    // `confect codegen` emits convex/ entries + confect/_generated (it bundles
    // and imports each impl via bundle-require to snapshot function names).
    await execFileP("node", [cliPath, "codegen"], { cwd: appDir });
  }

  const entries = await listFunctionEntries(appDir);
  if (entries.length === 0) {
    throw new Error(`no function entries generated for ${appDir}`);
  }
  const sampled = sample(entries, SAMPLE);

  const bundleDir = join(appDir, ".bundles");
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  const rows = [];
  let savedMetafile = false;
  for (const entry of sampled) {
    const base = entry.split("/").pop().replace(/\.ts$/, "");
    const outMin = join(bundleDir, `${base}.min.mjs`);
    const outRaw = join(bundleDir, `${base}.raw.mjs`);

    const min = await bundle(entry, outMin, { minify: true });
    const raw = await bundle(entry, outRaw, { minify: false });

    // Save one metafile per cell for the isolation/faithfulness verification.
    if (!savedMetafile) {
      await mkdir(join(outDir, "metafiles"), { recursive: true });
      await writeFile(
        join(outDir, "metafiles", `${cellId(cell)}.json`),
        JSON.stringify(raw.metafile, null, 2),
      );
      savedMetafile = true;
    }

    const evalSamples = await evalCold(outMin);

    rows.push({
      version: cell.version,
      G: cell.G,
      F: cell.F,
      T: cell.T,
      complexity: cell.complexity,
      entry: base,
      bundleBytesMin: min.bytes,
      bundleBytesRaw: raw.bytes,
      evalMedianMs: round(median(evalSamples)),
      evalP90Ms: round(percentile(evalSamples, 90)),
    });
  }
  return rows;
}

const round = (x) => Math.round(x * 1000) / 1000;

// Local copy to avoid a circular import with config.mjs.
function cellId(c) {
  return `${c.version}-G${c.G}-F${c.F}-T${c.T}-${c.complexity}`;
}
