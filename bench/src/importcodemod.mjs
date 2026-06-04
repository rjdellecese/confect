// Codemod enforcing submodule imports of Effect packages across the repo:
//   import { Schema } from "effect"            -> import * as Schema from "effect/Schema"
//   import { pipe } from "effect"              -> import { pipe } from "effect/Function"
//   import { Path } from "@effect/platform"    -> import * as Path from "@effect/platform/Path"
// Type-only specifiers stay on the barrel (exempt from the lint rule). Barrel
// namespace imports defeat esbuild tree-shaking; this is also Effect v4's
// recommended style. See bench/PROTOTYPE.md / ATTRIBUTION.md §5.
//
//   node src/importcodemod.mjs
//   then rebuild: pnpm build  (and re-run lint/tests)

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

// effect's namespace re-exports (`export * as Name`) — names that must move to a
// submodule import. Everything else imported from "effect" is a bare value
// (pipe/flow/identity, → effect/Function) or a type (stays on the barrel).
const effectIndex = join(repo, "node_modules/effect/dist/esm/index.js");
const EFFECT_NS = new Set(
  [...(await readFile(effectIndex, "utf8")).matchAll(/export \* as ([A-Za-z0-9_]+) /g)].map((m) => m[1]),
);

// @effect/* packages whose every named import (in this repo) is a namespace with
// a matching submodule path. @effect/vitest is intentionally not listed (exempt).
const SCOPED = ["@effect/platform", "@effect/platform-node", "@effect/cli", "@effect/printer-ansi", "@effect/printer"];

const splitSpecs = (inner) => inner.split(",").map((s) => s.trim()).filter(Boolean);
// Parse a specifier into { base, alias, raw }, handling `Name as Alias`.
const parseSpec = (s) => {
  const m = s.match(/^(.+?)\s+as\s+(.+)$/);
  return m ? { base: m[1].trim(), alias: m[2].trim(), raw: s } : { base: s, alias: s, raw: s };
};
const partition = (specs) => {
  const types = [], values = [];
  for (const s of specs) (s.startsWith("type ") ? types : values).push(parseSpec(s.replace(/^type\s+/, "").trim()));
  return { types, values };
};
const nsLine = (pkg, { base, alias }) => `import * as ${alias} from "${pkg}/${base}";`;

function rewriteEffect(src) {
  return src.replace(/import\s*\{([^}]*)\}\s*from\s*["']effect["'];?/gs, (full, inner) => {
    const { types, values } = partition(splitSpecs(inner));
    const ns = values.filter((v) => EFFECT_NS.has(v.base)).map((v) => nsLine("effect", v)).sort();
    const helpers = values.filter((v) => !EFFECT_NS.has(v.base)).map((v) => v.raw);
    const lines = [];
    if (helpers.length) lines.push(`import { ${helpers.join(", ")} } from "effect/Function";`);
    if (types.length) lines.push(`import type { ${types.map((t) => t.raw).join(", ")} } from "effect";`);
    lines.push(...ns);
    return lines.length ? lines.join("\n") : full;
  });
}

function rewriteScoped(src, pkg) {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${pkg}["'];?`, "gs");
  return src.replace(re, (full, inner) => {
    const { types, values } = partition(splitSpecs(inner));
    const ns = values.map((v) => nsLine(pkg, v)).sort();
    const lines = [];
    if (types.length) lines.push(`import type { ${types.map((t) => t.raw).join(", ")} } from "${pkg}";`);
    lines.push(...ns);
    return lines.length ? lines.join("\n") : full;
  });
}

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "_generated") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const roots = [
  ...["core", "server", "cli", "js", "react", "test"].map((p) => join(repo, "packages", p)),
  join(repo, "apps/example"),
];

let files = 0;
for (const root of roots) {
  for (const path of await walk(root)) {
    const before = await readFile(path, "utf8");
    let src = rewriteEffect(before);
    for (const pkg of SCOPED) src = rewriteScoped(src, pkg);
    if (src !== before) {
      await writeFile(path, src);
      files++;
    }
  }
}
console.log(`rewrote barrel imports in ${files} files (${EFFECT_NS.size} effect namespaces)`);
console.log("next: pnpm build && pnpm -r lint");
