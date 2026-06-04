// Attribution probe: decomposes the Confect per-function cold-eval time into
// layers by bundling and cold-evaluating progressively larger entry points in a
// minimal (G1/F1/T1) Confect app, so group/table scaling is out of the picture.
//
//   floor   : export const x = 1            (Node start + import machinery)
//   convex  : import "convex/server"+values (the vanilla baseline's externals)
//   effect  : import * as E from "effect"   (effect barrel eval, upper bound)
//   server  : import * as S from "@confect/server" (+ the effect it pulls)
//   schema  : import the generated _generated/schema default (table modules)
//   full    : the real convex/g0.ts entry   (+ buildForGroup registration)
//
// Each is bundled identically (convex + node builtins external) and evaluated in
// a fresh Node process; we report median over many reps and the layer deltas.

import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { generate } from "./generate.mjs";
import { bundle } from "./esbuildBundle.mjs";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const cliPath = join(repoRoot, "packages", "cli", "dist", "index.mjs");
const evalChild = join(here, "evalChild.mjs");

const REPS = 25;
const WARMUP = 3;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function evalCold(bundlePath) {
  const samples = [];
  for (let i = 0; i < WARMUP + REPS; i++) {
    const { stdout } = await execFileP("node", [evalChild, bundlePath], {
      env: { ...process.env, NODE_COMPILE_CACHE: "" },
    });
    if (i >= WARMUP) samples.push(JSON.parse(stdout).ms);
  }
  return median(samples);
}

async function main() {
  const appDir = join(here, "..", "work", "_attrib");
  await generate({ version: "confect", G: 1, F: 1, T: 1, complexity: "medium" }, appDir);
  await execFileP("node", [cliPath, "codegen"], { cwd: appDir });

  const probesDir = join(appDir, "convex", "_probes");
  await mkdir(probesDir, { recursive: true });
  const probes = {
    floor: `export const x = 1;`,
    convex: `import { queryGeneric } from "convex/server";\nimport { v } from "convex/values";\nglobalThis.__sink = [queryGeneric, v];`,
    effect: `import * as E from "effect";\nglobalThis.__sink = E;`,
    server: `import * as S from "@confect/server";\nglobalThis.__sink = S;`,
    // import the generated runtime schema default (relative to convex/)
    schema: `import schema from "../../confect/_generated/schema";\nglobalThis.__sink = schema;`,
  };
  const entries = {};
  for (const [name, src] of Object.entries(probes)) {
    const p = join(probesDir, `${name}.ts`);
    await writeFile(p, src);
    entries[name] = p;
  }
  entries.full = join(appDir, "convex", "g0.ts");

  const bundleDir = join(appDir, ".bundles");
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  const order = ["floor", "convex", "effect", "schema", "server", "full"];
  const results = {};
  for (const name of order) {
    const out = join(bundleDir, `${name}.mjs`);
    const { bytes } = await bundle(entries[name], out, { minify: true });
    const ms = await evalCold(out);
    results[name] = { ms, bytes };
    process.stdout.write(
      `${name.padEnd(7)} ${ms.toFixed(1).padStart(7)} ms   ${(bytes / 1024).toFixed(1).padStart(8)} KiB\n`,
    );
  }

  const d = (a, b) => (results[a].ms - results[b].ms).toFixed(1);
  console.log("\nLayer attribution (median deltas):");
  console.log(`  Node + import floor            : ${results.floor.ms.toFixed(1)} ms`);
  console.log(`  convex externals (vanilla cost): +${d("convex", "floor")} ms`);
  console.log(`  effect barrel (upper bound)    : +${d("effect", "floor")} ms vs floor`);
  console.log(`  @confect/server import         : ${results.server.ms.toFixed(1)} ms total`);
  console.log(`  _generated/schema (tables)     : ${results.schema.ms.toFixed(1)} ms total`);
  console.log(`  full entry (registration)      : ${results.full.ms.toFixed(1)} ms total`);
  console.log(`  registration delta (full−server): +${d("full", "server")} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
