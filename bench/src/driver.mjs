// Orchestrates the full sweep: for each cell, generate the synthetic app, run
// codegen + bundle + cold-eval measurement, and collect rows. Writes raw results
// to out/results.json, then renders the comparison report.
//
// Prereq: from the repo root, `pnpm install && pnpm build` (bundles consume the
// built @confect/* dist, not src).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SWEEP, cellId } from "./config.mjs";
import { generate } from "./generate.mjs";
import { measureCell } from "./measure.mjs";
import { renderReport } from "./report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const benchRoot = resolve(here, "..");
const workDir = join(benchRoot, "work");
const outDir = join(benchRoot, "out");

async function main() {
  await mkdir(workDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const all = [];
  let i = 0;
  for (const cell of SWEEP) {
    i++;
    const id = cellId(cell);
    const appDir = join(workDir, id);
    process.stdout.write(`[${i}/${SWEEP.length}] ${id} … `);
    try {
      await generate(cell, appDir);
      const rows = await measureCell(cell, appDir, outDir);
      all.push(...rows);
      const r = rows[0];
      process.stdout.write(
        `ok  bundleMin=${r.bundleBytesMin}B eval=${r.evalMedianMs}ms (${rows.length} fns)\n`,
      );
    } catch (err) {
      process.stdout.write(`FAILED\n`);
      console.error(err?.stderr || err?.message || err);
    }
  }

  await writeFile(
    join(outDir, "results.json"),
    JSON.stringify(all, null, 2),
  );
  await renderReport(all, benchRoot);
  process.stdout.write(
    `\nDone. ${all.length} rows. Report: bench/RESULTS.md, bench/results.csv\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
