// Synthetic-app generator. Given a cell {version, G, F, T, complexity} it writes
// a self-contained Convex project into `appDir`, in one of two emit modes:
//
//   - "vanilla":  plain Convex (queryGeneric + v.* validators, no Effect/Confect)
//   - "confect":  Confect v9 (Table.make thunks, FunctionSpec, GroupImpl)
//
// Both modes encode the SAME logical workload: T tables and G groups of F
// functions each, every shape drawn from shapes.mjs. The only difference is the
// framework, so measured per-function cold-start differences are the Confect
// overhead.
//
// Module resolution: appDir lives under bench/work/, so esbuild and the Confect
// CLI resolve `@confect/*`, `effect`, and `convex` by walking up to
// bench/node_modules (this package declares them as deps).

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { convexBody, effectBody } from "./shapes.mjs";

const write = async (path, contents) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
};

const fnNames = (F) => Array.from({ length: F }, (_, j) => `f${j}`);
const tableNames = (T) => Array.from({ length: T }, (_, i) => `t${i}`);
const groupNames = (G) => Array.from({ length: G }, (_, n) => `g${n}`);

const packageJson = (name) =>
  `${JSON.stringify({ name, version: "0.0.0", private: true, type: "module" }, null, 2)}\n`;

const convexJson = () =>
  `${JSON.stringify({ codegen: { staticApi: false, staticDataModel: false } }, null, 2)}\n`;

// ---------------------------------------------------------------------------
// vanilla Convex
// ---------------------------------------------------------------------------

const vanillaSchema = (T, complexity) => {
  const body = convexBody(complexity);
  const tables = tableNames(T)
    .map((t) => `  ${t}: defineTable(${body}).index("by_text", ["text"]),`)
    .join("\n");
  return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
${tables}
});
`;
};

const vanillaGroup = (complexity, F) => {
  const body = convexBody(complexity);
  const fns = fnNames(F)
    .map(
      (f) => `export const ${f} = queryGeneric({
  args: { input: ${indent(body, "  ")} },
  returns: ${indent(body, "  ")},
  handler: async () => null,
});`,
    )
    .join("\n\n");
  return `import { queryGeneric } from "convex/server";
import { v } from "convex/values";

${fns}
`;
};

// ---------------------------------------------------------------------------
// Confect v9
// ---------------------------------------------------------------------------

const confectTable = (complexity) =>
  `import { Table } from "@confect/server";
import { Schema } from "effect";

export default Table.make(() =>
  ${indent(effectBody(complexity), "  ")},
).index("by_text", ["text"]);
`;

const confectSpec = (complexity, F) => {
  const body = effectBody(complexity);
  const fns = fnNames(F)
    .map(
      (f) => `  .addFunction(
    FunctionSpec.publicQuery({
      name: "${f}",
      args: () => ${indent(body, "      ")},
      returns: () => ${indent(body, "      ")},
    }),
  )`,
    )
    .join("\n");
  return `import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export default GroupSpec.make()
${fns};
`;
};

const confectImpl = (groupName, F) => {
  const names = fnNames(F);
  const decls = names
    .map(
      (f) =>
        `const ${f} = FunctionImpl.make(databaseSchema, group, "${f}", () =>\n  Effect.succeed(null),\n);`,
    )
    .join("\n\n");
  const provides = names.map((f) => `  Layer.provide(${f}),`).join("\n");
  return `import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import databaseSchema from "./_generated/schema";
import group from "./${groupName}.spec";

${decls}

export default GroupImpl.make(databaseSchema, group).pipe(
${provides}
  GroupImpl.finalize,
);
`;
};

// ---------------------------------------------------------------------------

function indent(text, pad) {
  return text.replace(/\n/g, `\n${pad}`);
}

export async function generate(cell, appDir) {
  await rm(appDir, { recursive: true, force: true });
  await mkdir(appDir, { recursive: true });
  await write(join(appDir, "package.json"), packageJson(`bench-app`));
  await write(join(appDir, "convex.json"), convexJson());

  if (cell.version === "vanilla") {
    await write(
      join(appDir, "convex", "schema.ts"),
      vanillaSchema(cell.T, cell.complexity),
    );
    for (const g of groupNames(cell.G)) {
      await write(
        join(appDir, "convex", `${g}.ts`),
        vanillaGroup(cell.complexity, cell.F),
      );
    }
  } else {
    // Confect: author confect/ only; `confect codegen` emits convex/ + _generated/.
    await mkdir(join(appDir, "convex"), { recursive: true });
    for (const t of tableNames(cell.T)) {
      await write(
        join(appDir, "confect", "tables", `${t}.ts`),
        confectTable(cell.complexity),
      );
    }
    for (const g of groupNames(cell.G)) {
      await write(
        join(appDir, "confect", `${g}.spec.ts`),
        confectSpec(cell.complexity, cell.F),
      );
      await write(
        join(appDir, "confect", `${g}.impl.ts`),
        confectImpl(g, cell.F),
      );
    }
  }
}
