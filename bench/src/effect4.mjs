// Projects how Effect v4 ("effect-smol") would affect the Confect per-function
// cold-start cost. Since that cost is dominated by evaluating the Effect library
// (Confect's own code is ~3 ms), we compare the library-load cost of the
// surfaces a Confect function needs — the runtime (Effect/Layer) and Schema —
// between Effect 3.x and the Effect 4 beta, apples-to-apples.
//
// Installs both versions into bench/work-effect/{v3,v4} (gitignored, needs
// network), bundles identical probes with esbuild, and cold-evaluates each in a
// fresh Node process. Reports minified bytes, min+gzip bytes (to compare with
// Effect's public bundle-size claims), and median cold-eval ms.
//
//   node src/effect4.mjs

import { execFile } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as esbuild from "esbuild";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const evalChild = join(here, "evalChild.mjs");
const root = resolve(here, "..", "work-effect");

const VERSIONS = { v3: "3.21.2", v4: "4.0.0-beta.78" };

// Identical probe source for both versions; submodule import paths
// (effect/Effect, effect/Layer, effect/Schema, effect/Stream) exist in v3 and v4.
const PROBES = {
  runtime: `import * as Effect from "effect/Effect";\nimport * as Layer from "effect/Layer";\nglobalThis.__s = [Effect, Layer];`,
  schema: `import * as Schema from "effect/Schema";\nglobalThis.__s = [Schema];`,
  "runtime+schema": `import * as Effect from "effect/Effect";\nimport * as Layer from "effect/Layer";\nimport * as Schema from "effect/Schema";\nglobalThis.__s = [Effect, Layer, Schema];`,
  "Effect+Stream+Schema": `import * as Effect from "effect/Effect";\nimport * as Stream from "effect/Stream";\nimport * as Schema from "effect/Schema";\nglobalThis.__s = [Effect, Stream, Schema];`,
  barrel: `import * as E from "effect";\nglobalThis.__s = E;`,
};

const REPS = 31;
const WARMUP = 4;

async function ensureInstalled() {
  for (const [v, version] of Object.entries(VERSIONS)) {
    const dir = join(root, v);
    if (existsSync(join(dir, "node_modules", "effect", "package.json"))) continue;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "package.json"), `{"name":"eff-${v}","private":true}\n`);
    process.stdout.write(`installing effect@${version} … `);
    await execFileP("npm", ["install", `effect@${version}`, "--no-audit", "--no-fund", "--silent"], { cwd: dir });
    process.stdout.write("done\n");
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function evalCold(out) {
  const xs = [];
  for (let i = 0; i < WARMUP + REPS; i++) {
    const { stdout } = await execFileP("node", [evalChild, out], {
      env: { ...process.env, NODE_COMPILE_CACHE: "" },
    });
    if (i >= WARMUP) xs.push(JSON.parse(stdout).ms);
  }
  return median(xs);
}

async function measure(v, name, src) {
  const dir = join(root, v);
  const probesDir = join(dir, "_probes");
  await mkdir(probesDir, { recursive: true });
  const entry = join(probesDir, `${name.replace(/\W/g, "_")}.ts`);
  const out = join(probesDir, `${name.replace(/\W/g, "_")}.mjs`);
  await writeFile(entry, src);
  const r = await esbuild.build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm",
    platform: "node", target: "esnext", minify: true, metafile: true,
    absWorkingDir: dir, logLevel: "silent",
  });
  const bytes = (await stat(out)).size;
  const gz = gzipSync(await readFile(out)).length;
  const okey = Object.keys(r.metafile.outputs).find((k) => !k.endsWith(".map"));
  const fastCheck = Object.keys(r.metafile.outputs[okey].inputs).some((k) => k.includes("fast-check"));
  const ms = await evalCold(out);
  return { bytes, gz, ms, fastCheck };
}

async function main() {
  await ensureInstalled();
  const rows = [];
  for (const name of Object.keys(PROBES)) {
    const a = await measure("v3", name, PROBES[name]);
    const b = await measure("v4", name, PROBES[name]);
    rows.push({ name, a, b });
  }

  const kib = (x) => (x / 1024).toFixed(1) + " KiB";
  const pct = (n, o) => {
    const d = ((n - o) / o) * 100;
    return (d >= 0 ? "+" : "") + d.toFixed(0) + "%";
  };
  console.log(`\nEffect 3.21.2 vs 4.0.0-beta.78 — library-load cost (esbuild min, fresh-process eval)\n`);
  console.log("surface              | v3 min    v3 gz   v3 eval | v4 min    v4 gz   v4 eval | Δbytes Δeval");
  console.log("-".repeat(104));
  for (const { name, a, b } of rows) {
    console.log(
      `${name.padEnd(20)} | ${kib(a.bytes).padStart(8)} ${kib(a.gz).padStart(7)} ${a.ms.toFixed(1).padStart(7)}ms | ` +
        `${kib(b.bytes).padStart(8)} ${kib(b.gz).padStart(7)} ${b.ms.toFixed(1).padStart(7)}ms | ` +
        `${pct(b.bytes, a.bytes).padStart(5)} ${pct(b.ms, a.ms).padStart(5)}`,
    );
  }
  console.log(
    `\nfast-check retained in Schema bundle: v3=${rows.find((r) => r.name === "schema").a.fastCheck}, v4=${rows.find((r) => r.name === "schema").b.fastCheck}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
