// Quantifies the upper bound on reducing the Confect per-function cold-start
// cost by stubbing out modules a plain query/mutation arguably shouldn't need —
// effect's Stream/Channel/Sink/PubSub/STM machinery and fast-check — then
// measuring the bundle-size and cold-eval savings vs the unmodified entry.
//
// Stubbing (replacing a module's body with `export default {}`) is an upper
// bound: it shows what's achievable IF those imports were removed/deferred. It
// is not a working build — it's a measurement of the ceiling.

import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as esbuild from "esbuild";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const evalChild = join(here, "evalChild.mjs");

const EXTERNAL = [
  "convex", "convex/*",
  ...builtinModules, ...builtinModules.map((m) => `node:${m}`),
];

// Paths whose bodies we stub to simulate their removal.
const REMOVE = [
  /effect\/dist\/esm\/Stream\.js$/, /effect\/dist\/esm\/Channel\.js$/,
  /effect\/dist\/esm\/Sink\.js$/, /effect\/dist\/esm\/PubSub\.js$/,
  /effect\/dist\/esm\/TPubSub\.js$/, /effect\/dist\/esm\/TQueue\.js$/,
  /effect\/dist\/esm\/TRef\.js$/, /effect\/dist\/esm\/STM\.js$/,
  /effect\/dist\/esm\/internal\/stream\.js$/, /effect\/dist\/esm\/internal\/channel/,
  /effect\/dist\/esm\/internal\/sink/, /effect\/dist\/esm\/internal\/pubsub\.js$/,
  /effect\/dist\/esm\/internal\/groupBy\.js$/, /effect\/dist\/esm\/internal\/mailbox\.js$/,
  /effect\/dist\/esm\/internal\/subscriptionRef\.js$/,
  /effect\/dist\/esm\/internal\/stm\//,
  /\/fast-check\//,
];

const stubPlugin = {
  name: "stub-removable",
  setup(build) {
    build.onLoad({ filter: /\.(js|mjs|ts)$/ }, (args) => {
      if (REMOVE.some((re) => re.test(args.path))) {
        return { contents: "export default {}; export {};", loader: "js" };
      }
      return null;
    });
  },
};

async function buildOne(entry, out, { stub }) {
  await esbuild.build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm",
    platform: "node", target: "esnext", minify: true, external: EXTERNAL,
    logLevel: "silent", absWorkingDir: process.cwd(),
    plugins: stub ? [stubPlugin] : [],
  });
  return (await stat(out)).size;
}

async function evalCold(out) {
  const xs = [];
  for (let i = 0; i < 25 + 3; i++) {
    const { stdout } = await execFileP("node", [evalChild, out], {
      env: { ...process.env, NODE_COMPILE_CACHE: "" },
    });
    if (i >= 3) xs.push(JSON.parse(stdout).ms);
  }
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)];
}

async function main() {
  const appDir = resolve(here, "..", "work", "_attrib");
  const entry = join(appDir, "convex", "g0.ts");
  const outDir = join(appDir, ".bundles");
  await mkdir(outDir, { recursive: true });

  const baseOut = join(outDir, "reduce-base.mjs");
  const stubOut = join(outDir, "reduce-stub.mjs");
  const baseBytes = await buildOne(entry, baseOut, { stub: false });
  const stubBytes = await buildOne(entry, stubOut, { stub: true });
  const baseMs = await evalCold(baseOut);
  const stubMs = await evalCold(stubOut);

  const k = (b) => (b / 1024).toFixed(1) + " KiB";
  console.log("Best-case reduction (stub Stream/STM/PubSub/fast-check):\n");
  console.log(`  baseline : ${k(baseBytes)}  eval ${baseMs.toFixed(1)} ms`);
  console.log(`  stubbed  : ${k(stubBytes)}  eval ${stubMs.toFixed(1)} ms`);
  console.log(
    `  saved    : ${k(baseBytes - stubBytes)} (${(((baseBytes - stubBytes) / baseBytes) * 100).toFixed(0)}%)  ` +
      `eval -${(baseMs - stubMs).toFixed(1)} ms (${(((baseMs - stubMs) / baseMs) * 100).toFixed(0)}%)`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
