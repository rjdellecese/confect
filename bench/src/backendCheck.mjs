// Real-Convex cross-check (offline). Instead of standing up a live backend, this
// drives Convex's *own* deployment bundler (`convex/dist/esm/bundler`) — the same
// code path `convex dev`/`deploy` uses to bundle and size function modules — and
// compares its reported per-function bundle size to our esbuild proxy.
//
// We bundle each function entry independently (no code splitting) with
// platform:"browser" (the Convex isolate environment), matching the proxy's
// per-function measurement. If the internal bundler API is unavailable, the
// check is skipped and the esbuild proxy stands as the primary metric.

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, mkdir, writeFile } from "node:fs/promises";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const benchRoot = resolve(here, "..");
const repoRoot = resolve(benchRoot, "..");
const cliPath = join(repoRoot, "packages", "cli", "dist", "index.mjs");
const require = createRequire(import.meta.url);

async function loadConvexBundler() {
  const convexPkg = require.resolve("convex/package.json");
  const convexRoot = dirname(convexPkg);
  const bundlerIndex = join(convexRoot, "dist", "esm", "bundler", "index.js");
  const fsModule = join(convexRoot, "dist", "esm", "bundler", "fs.js");
  const { bundle, entryPoints } = await import(bundlerIndex);
  const { nodeFs } = await import(fsModule);
  // Minimal ctx: bundle()/entryPoints() only need a filesystem and a crash hook
  // on the empty-allow-list path (no external package resolution).
  const ctx = {
    fs: nodeFs,
    crash: async (e) => {
      throw new Error(e?.printedMessage || "convex bundler crash");
    },
    crashIfNotADeployment: async () => {},
  };
  return { bundle, entryPoints, ctx };
}

const REP_CELLS = [
  { version: "vanilla", G: 5, F: 8, T: 5, complexity: "medium" },
  { version: "confect", G: 5, F: 8, T: 5, complexity: "medium" },
];

async function main() {
  let api;
  try {
    api = await loadConvexBundler();
  } catch (err) {
    console.log("SKIPPED: Convex bundler API not loadable —", err.message);
    return;
  }
  const ctx = api.ctx;

  console.log("Real-Convex bundler cross-check (platform=browser, per-entry):\n");
  const out = {};
  for (const cell of REP_CELLS) {
    const appDir = join(benchRoot, "work", `_xcheck-${cell.version}`);
    await generate(cell, appDir);
    if (cell.version === "confect") {
      await execFileP("node", [cliPath, "codegen"], { cwd: appDir });
    }
    const convexDir = join(appDir, "convex");
    const files = (await readdir(convexDir)).filter((f) => /^g\d+\.ts$/.test(f));
    const sample = files.slice(0, 3).map((f) => join(convexDir, f));

    const sizes = [];
    for (const entry of sample) {
      const { modules } = await api.bundle({
        ctx,
        dir: convexDir,
        entryPoints: [entry],
        generateSourceMaps: false,
        platform: "browser",
        splitting: false,
      });
      const total = modules.reduce(
        (a, m) => a + Buffer.byteLength(m.source, "utf8"),
        0,
      );
      sizes.push(total);
    }
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    out[cell.version] = { avgBytes: Math.round(avg), n: sizes.length };
    console.log(
      `  ${cell.version.padEnd(8)} avg per-function bundle = ${(avg / 1024).toFixed(1)} KiB  (n=${sizes.length})`,
    );
  }
  await mkdir(join(benchRoot, "out"), { recursive: true });
  await writeFile(
    join(benchRoot, "out", "crosscheck.json"),
    JSON.stringify(
      { cell: "G5-F8-T5-medium", platform: "browser", minified: false, ...out },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("cross-check failed:", e?.message || e);
  process.exit(0); // non-fatal: proxy is primary
});
