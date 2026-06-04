// Isolates the real import lever for Effect bundle size: it is NOT `import * as`
// vs named imports — it's the BARREL (`from "effect"`) vs the SUBMODULE path
// (`from "effect/Schema"`). Importing a large namespace (Schema, Stream) from the
// barrel defeats esbuild tree-shaking; importing it from the submodule does not.
// And a single barrel importer anywhere in the graph spoils it for the whole
// bundle.
//
//   node src/treeshake.mjs       (installs effect@3.21.2 into work-effect/v3)

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as esbuild from "esbuild";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "..", "work-effect", "v3");

async function ensure() {
  if (existsSync(join(dir, "node_modules", "effect", "package.json"))) return;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), `{"name":"ts-v3","private":true}\n`);
  process.stdout.write("installing effect@3.21.2 … ");
  await execFileP("npm", ["install", "effect@3.21.2", "--no-audit", "--no-fund", "--silent"], { cwd: dir });
  process.stdout.write("done\n");
}

async function bundleSize(name, src) {
  const entry = join(dir, `_${name}.ts`);
  const out = join(dir, `_${name}.mjs`);
  await writeFile(entry, src);
  await esbuild.build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm",
    platform: "node", target: "esnext", minify: true, absWorkingDir: dir, logLevel: "silent",
  });
  const buf = await readFile(out);
  return { min: buf.length, gz: gzipSync(buf).length };
}

// Realistic, AST-walking Schema usage (close to what @confect/server does).
const usage = (ns) => `
const S = ${ns}.Struct({ a: ${ns}.String, b: ${ns}.optional(${ns}.Array(${ns}.Number)), c: ${ns}.Union(${ns}.Literal("x"), ${ns}.Null) });
globalThis.x = [${ns}.decodeUnknownSync(S), ${ns}.encodeSync(S), ${ns}.encodedSchema(S).ast];
`;

async function main() {
  await ensure();
  const cases = {
    "namespace submodule  import * as Schema from 'effect/Schema'": `import * as Schema from "effect/Schema";${usage("Schema")}`,
    "named     submodule  import { Struct,... } from 'effect/Schema'": `import { Struct, String, optional, Array as Arr, Number as Num, Union, Literal, Null, decodeUnknownSync, encodeSync, encodedSchema } from "effect/Schema";\nconst S = Struct({ a: String, b: optional(Arr(Num)), c: Union(Literal("x"), Null) });\nglobalThis.x = [decodeUnknownSync(S), encodeSync(S), encodedSchema(S).ast];`,
    "BARREL               import { Schema } from 'effect'": `import { Schema } from "effect";${usage("Schema")}`,
  };
  const k = (x) => (x / 1024).toFixed(1) + " KiB";
  console.log("\nSchema bundle size by import style (effect 3.21.2, esbuild min):\n");
  for (const [name, src] of Object.entries(cases)) {
    const { min, gz } = await bundleSize(name.replace(/\W/g, "_").slice(0, 20), src);
    console.log(`  ${k(min).padStart(10)}  ${(gz / 1024).toFixed(1).padStart(6)} gz   ${name}`);
  }

  // One barrel importer spoils the whole bundle.
  await writeFile(join(dir, "_sub.ts"), `import * as Schema from "effect/Schema";\nexport const a = Schema.decodeUnknownSync(Schema.Struct({ a: Schema.String }));`);
  await writeFile(join(dir, "_bar.ts"), `import { Schema } from "effect";\nexport const b = Schema.decodeUnknownSync(Schema.Struct({ b: Schema.String }));`);
  const both = await bundleSize("spoil_none", `import { a } from "./_sub.ts";\nimport * as S2 from "effect/Schema";\nglobalThis.x = [a, S2.decodeUnknownSync(S2.Struct({ c: S2.String }))];`);
  const spoil = await bundleSize("spoil_one", `import { a } from "./_sub.ts";\nimport { b } from "./_bar.ts";\nglobalThis.x = [a, b];`);
  console.log(`\nOne barrel importer spoils the whole bundle:`);
  console.log(`  all submodule importers : ${k(both.min)}`);
  console.log(`  + one barrel importer   : ${k(spoil.min)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
