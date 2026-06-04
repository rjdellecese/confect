// PROTOTYPE codemod: rewrites barrel Effect imports
//   import { Schema, Effect, Layer } from "effect"
// into per-namespace submodule imports
//   import * as Schema from "effect/Schema"; ...
// across @confect/server and @confect/core source, leaving bare value exports
// (pipe/flow/identity) and type-only specifiers on the barrel.
//
// Why: importing a namespace from the "effect" barrel defeats esbuild
// tree-shaking (it pulls the whole namespace); the submodule path tree-shakes.
// This is the import style Effect v4 recommends. See bench/PROTOTYPE.md.
//
//   node src/importcodemod.mjs           # rewrite (then rebuild: pnpm --filter @confect/core --filter @confect/server build)

import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const require = createRequire(import.meta.url);

// Derive the set of namespace re-exports (`export * as Name`) from the installed
// effect barrel — these are the identifiers that must move to submodule imports.
const effectIndex = require.resolve("effect");
const indexSrc = await readFile(effectIndex, "utf8");
const NS = new Set([...indexSrc.matchAll(/export \* as ([A-Za-z0-9_]+) /g)].map((m) => m[1]));

const dirs = [join(repo, "packages/server/src"), join(repo, "packages/core/src")];
const importRe = /import\s*\{([^}]*)\}\s*from\s*["']effect["'];?/gs;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

let rewrites = 0, files = 0;
for (const dir of dirs) {
  for (const path of await walk(dir)) {
    let src = await readFile(path, "utf8");
    let changed = false;
    src = src.replace(importRe, (_full, inner) => {
      const ns = [], typeKeep = [], valueKeep = [];
      for (const spec of inner.split(",").map((s) => s.trim()).filter(Boolean)) {
        const isType = spec.startsWith("type ");
        const bare = spec.replace(/^type\s+/, "").trim();
        if (isType) typeKeep.push(bare);
        else if (NS.has(bare)) ns.push(`import * as ${bare} from "effect/${bare}";`);
        else valueKeep.push(bare);
      }
      const out = [];
      if (valueKeep.length) out.push(`import { ${valueKeep.join(", ")} } from "effect";`);
      if (typeKeep.length) out.push(`import type { ${typeKeep.join(", ")} } from "effect";`);
      out.push(...ns.sort());
      changed = true;
      rewrites++;
      return out.join("\n");
    });
    if (changed) {
      await writeFile(path, src);
      files++;
    }
  }
}
console.log(`rewrote ${rewrites} barrel imports across ${files} files (${NS.size} known effect namespaces)`);
console.log("next: pnpm --filter @confect/core --filter @confect/server build");
