// Pinpoints which modules dominate the Confect cold-eval cost, two ways:
//
//  1) Static composition: aggregate the REAL function entry's esbuild metafile
//     input bytes by library (effect submodule / @confect/server / convex / etc.).
//     Bytes ≈ parse+compile cost and correlate with eval cost.
//
//  2) Dynamic CPU profile: cold-import @confect/server unbundled with
//     --cpu-prof, then bucket sampled self-time by source module. (Unbundled
//     evaluates the full barrel — a superset of the tree-shaken entry — but the
//     hot modules are the same ones the entry pulls.)

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { generate } from "./generate.mjs";
import { bundle } from "./esbuildBundle.mjs";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const cliPath = join(repoRoot, "packages", "cli", "dist", "index.mjs");

// Classify a module path into a coarse bucket for attribution.
function bucket(p) {
  const effect = p.match(/\/(effect)\/dist\/esm\/([^/]+)/);
  if (effect) {
    const sub = effect[2].replace(/\.js$/, "");
    // group internal/* together, keep public modules (Schema, Effect, ...) named
    if (sub === "internal") {
      const inner = p.match(/\/internal\/([^/]+)/);
      return `effect/internal/${inner ? inner[1].replace(/\.js$/, "") : "?"}`;
    }
    return `effect/${sub}`;
  }
  if (p.includes("@effect/platform")) return "@effect/platform";
  if (p.includes("/@confect/server") || p.includes("packages/server/dist"))
    return "@confect/server";
  if (p.includes("/@confect/core") || p.includes("packages/core/dist"))
    return "@confect/core";
  if (p.includes("/convex/")) return "convex";
  if (p.includes("node:") || p.includes("internal/")) return "node:internal";
  return "other";
}

async function staticComposition(appDir) {
  const entry = join(appDir, "convex", "g0.ts");
  const out = join(appDir, ".bundles", "full.raw.mjs");
  await mkdir(dirname(out), { recursive: true });
  const { metafile, bytes } = await bundle(entry, out, { minify: false });
  // Use the OUTPUT's per-input contribution (bytesInOutput) — i.e. what actually
  // survives tree-shaking and ends up in the bundle — not the visited-graph size.
  const outKey = Object.keys(metafile.outputs).find((k) => !k.endsWith(".map"));
  const contribs = metafile.outputs[outKey].inputs;
  const byBucket = new Map();
  for (const [path, info] of Object.entries(contribs)) {
    const b = bucket(path);
    byBucket.set(b, (byBucket.get(b) ?? 0) + info.bytesInOutput);
  }
  const total = [...byBucket.values()].reduce((a, b) => a + b, 0);
  console.log(`\n# Static: real entry bundle = ${(bytes / 1024).toFixed(1)} KiB (raw); output composition by module:\n`);
  const top = [...byBucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [b, n] of top) {
    console.log(`  ${(n / 1024).toFixed(1).padStart(8)} KiB  ${((n / total) * 100).toFixed(1).padStart(5)}%  ${b}`);
  }
}

async function cpuProfile() {
  const profDir = join(here, "..", "work", "_prof");
  await rm(profDir, { recursive: true, force: true });
  await mkdir(profDir, { recursive: true });
  // Cold import of @confect/server, sampled finely.
  await execFileP(
    "node",
    [
      "--cpu-prof",
      "--cpu-prof-dir", profDir,
      "--cpu-prof-interval", "50",
      "--cpu-prof-name", "server.cpuprofile",
      "-e",
      "await import('@confect/server')",
    ],
    { cwd: join(here, ".."), env: { ...process.env, NODE_COMPILE_CACHE: "" } },
  );
  const files = (await readdir(profDir)).filter((f) => f.endsWith(".cpuprofile"));
  const prof = JSON.parse(await readFile(join(profDir, files[0]), "utf8"));

  // self time per node id, then aggregate by bucket of the node's url.
  const nodeById = new Map(prof.nodes.map((n) => [n.id, n]));
  const selfByNode = new Map();
  for (let i = 0; i < prof.samples.length; i++) {
    const id = prof.samples[i];
    const dt = prof.timeDeltas[i] ?? 0;
    selfByNode.set(id, (selfByNode.get(id) ?? 0) + dt);
  }
  const byBucket = new Map();
  let total = 0;
  for (const [id, us] of selfByNode) {
    const n = nodeById.get(id);
    const url = n?.callFrame?.url ?? "";
    const b = url ? bucket(url) : "(vm/builtin)";
    byBucket.set(b, (byBucket.get(b) ?? 0) + us);
    total += us;
  }
  console.log(`\n# Dynamic: cold import @confect/server CPU profile, total ${(total / 1000).toFixed(0)} ms of samples\n`);
  const top = [...byBucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  for (const [b, us] of top) {
    console.log(`  ${(us / 1000).toFixed(1).padStart(7)} ms  ${((us / total) * 100).toFixed(1).padStart(5)}%  ${b}`);
  }
}

async function main() {
  const appDir = join(here, "..", "work", "_attrib");
  // reuse _attrib if present; else regenerate
  try {
    await readFile(join(appDir, "convex", "g0.ts"));
  } catch {
    await generate({ version: "confect", G: 1, F: 1, T: 1, complexity: "medium" }, appDir);
    await execFileP("node", [cliPath, "codegen"], { cwd: appDir });
  }
  await staticComposition(appDir);
  await cpuProfile();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
