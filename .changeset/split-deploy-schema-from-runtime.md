---
"@confect/cli": major
"@confect/core": major
"@confect/server": major
"@confect/test": major
---

Split the deploy-time Convex schema from the runtime `DatabaseSchema`, and make `confect/tables/` the single source of truth — including the table name, which is now derived from the filename.

Previously, `confect/schema.ts` was user-authored and `DatabaseSchema` carried a `convexSchemaDefinition` field that was eagerly rebuilt on every `.addTable(...)`. That field was an `O(n²)` allocation for `n` tables, and it forced both the deploy CLI (which only needs `defineSchema(...)`) and the runtime (which only needs the table codec lookup) through the same module — so any runtime function bundle dragged in `convex/server`'s `defineSchema`. Issue 1.

Codegen now scans `confect/tables/*.ts` (every file must default-export a `Table`) and emits two siblings:

- `confect/_generated/schema.ts` — the runtime `DatabaseSchema`, consumed by `_generated/api.ts`. Imports `@confect/server` but never `convex/server`.
- `confect/_generated/convexSchema.ts` — the Convex deploy `SchemaDefinition`, re-exported one-line from `convex/schema.ts`. Imports `convex/server` but never `@confect/server`.

The `convexSchemaDefinition` field is removed from `DatabaseSchema` and `Api`. `TestConfect.layer` now takes the Convex schema definition as a separate argument so it can stay aligned with the deploy artifact without bringing the runtime schema along for the ride.

### Filename-derived table names

The table name is now derived from the file's basename — `confect/tables/notes.ts` defines a table called `notes`. `Table.make` no longer accepts a name argument and returns an *unnamed* `Table` value; codegen invokes that value with the filename to produce the bound table.

This eliminates a class of subtle infelicities: the file basename and the table name can never drift out of sync, cross-table `_id` references are type-constrained against the actual set of declared tables (catching typos at compile time), and ESM cycle hazards for mutual cross-table `Id` references are gone because authoring files no longer transitively import each other.

Codegen now emits two new sets of files alongside `_generated/schema.ts` and `_generated/convexSchema.ts`:

- `confect/_generated/id.ts` — a single `Id` constructor whose argument is type-constrained to the union of your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`.
- `confect/_generated/tables/<name>.ts` — one thin wrapper per table that binds the unnamed value from `confect/tables/<name>.ts` to its filename. This is what other modules (specs, impls, HTTP handlers) default-import to reach a table's `Doc`, `Fields`, and `tableName`.

Table filenames must be valid JS identifiers, may not start with `_` (Convex reserves underscore-prefixed names for system tables), and may not collide with reserved JS keywords like `import.ts`. Pick a casing convention you like — Confect's example code uses `snake_case` (`notes.ts`, `user_profiles.ts`).

The bound `Table`'s `name` property has been renamed to `tableName`. This avoids a silent collision with the built-in `Function.prototype.name` that JavaScript carries on every function value (including the new unnamed-callable `UnnamedTable`).

### Migration

1. Delete your `confect/schema.ts`. Codegen will refuse to run while a stray copy is present.
2. Rename each `confect/tables/<Name>.ts` to a valid JS identifier in your chosen casing convention (e.g. `confect/tables/notes.ts`). The basename becomes the table name; you no longer pass it as an argument.
3. Convert each table file to a **default-export-only** unnamed module: drop the name argument from `Table.make`, and switch any `GenericId.GenericId("users")` references to `Id("users")` imported from `../_generated/id`:

   ```diff
   - import { GenericId } from "@confect/core";
     import { Table } from "@confect/server";
     import { Schema } from "effect";
   + import { Id } from "../_generated/id";

   - export default Table.make(
   -   "notes",
   -   Schema.Struct({
   -     userId: Schema.optional(GenericId.GenericId("users")),
   -     text: Schema.String,
   -   }),
   - );
   + export default Table.make(
   +   Schema.Struct({
   +     userId: Schema.optional(Id("users")),
   +     text: Schema.String,
   +   }),
   + );
   ```

4. Rewire every consumer site (specs, impls, integration tests, HTTP handlers, etc.) to import from the generated wrapper rather than directly from `tables/`:

   ```diff
   - import Notes from "../tables/Notes";
   + import notes from "../_generated/tables/notes";

   - returns: Schema.Array(Notes.Doc),
   + returns: Schema.Array(notes.Doc),
   ```

5. Replace every remaining `GenericId.GenericId("x")` call site with `Id("x")` from `_generated/id` (in spec `args`/`returns`, in `TaggedError` schemas, in `TestConfect.run`, etc.).
6. If you read `table.name` anywhere off a bound `Table`, rename it to `table.tableName`.
7. Re-run `confect codegen`. It will create `confect/_generated/schema.ts`, `confect/_generated/convexSchema.ts`, `confect/_generated/id.ts`, and one `confect/_generated/tables/<name>.ts` wrapper per table; and it will rewrite `convex/schema.ts` to a one-line re-export.
8. If you use `@confect/test`, pass the generated Convex schema definition to `TestConfect.layer`:

   ```diff
   - import confectSchema from "./confect/schema";
   + import confectSchema from "./confect/_generated/schema";
   + import convexSchema from "./confect/_generated/convexSchema";

     export const layer = TestConfect_.layer(
       confectSchema,
   +   convexSchema,
       import.meta.glob("./convex/**/!(*.*.*)*.*s"),
     );
   ```

### New warning: no tables discovered

If a Confect project has no tables — either `confect/tables/` is missing entirely or it exists but contains no `.ts` files — codegen now emits a yellow `⚠` warning and continues, producing an empty `DatabaseSchema.make()` / `defineSchema({})`. Table-free backends (e.g. action-only proxies, webhook bridges) are still legal; the warning just catches the much more common case of a typoed directory name or files placed at the wrong path. To silence it, add at least one `Table.make(...)` module under `confect/tables/`.

### New error: invalid table filename

Codegen now rejects table files whose basename is not a valid JS identifier (e.g. `user-profiles.ts`), starts with `_` (reserved for Convex system tables), or shadows a reserved JS keyword (e.g. `import.ts`). Rename the offending file to fix it — for example, `user-profiles.ts` → `user_profiles.ts` or `userProfiles.ts`.
