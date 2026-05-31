---
"@confect/cli": major
"@confect/server": major
---

Make per-table schema construction lazy: `Table.make` now takes a callback that returns the field-schema definition, and a bound `Table`'s `Fields`, `Doc`, and `tableDefinition` properties are lazy memoised getters that only invoke the callback on first access.

Previously, every `confect/tables/<name>.ts` module ran `Schema.Struct({...})` (and the corresponding `compileTableSchema` / `defineTable` work) at module-load time. Because the codegen-emitted `confect/_generated/schema.ts` is imported transitively from every per-group function bundle, loading any one function eagerly built _every_ table's schema graph — paying a cold-start cost proportional to the whole project, not just the function being invoked.

`Table.make` now takes a `() => Schema.Struct({...})` callback; the bound `Table` exposes `Fields` / `Doc` / `tableDefinition` as lazy getters that compute their value on first access, then replace themselves with a plain non-writable data property so second-and-subsequent accesses are observably indistinguishable from a plain property (and skip all function-call overhead). The result: a function bundle only pays the schema-construction cost for tables it actually touches via `db.table(name)` (which reaches `Fields` through `Document.decode`).

### Breaking changes

- `Table.make` now takes `() => Schema.Schema.AnyNoContext` instead of a bare `Schema.Schema.AnyNoContext`. Every `confect/tables/<name>.ts` file must wrap its `Schema.Struct({...})` body in a `() => ...` callback.
- `UnnamedTable` no longer exposes `Fields` or `tableDefinition`. Read these off the bound `Table` (the codegen-emitted `confect/_generated/tables/<name>.ts` already binds the name) instead of the unnamed callable.

### Migration

1. Wrap every user-authored table definition's fields argument in a callback:

   ```diff
   -export default Table.make(
   -  Schema.Struct({
   -    text: Schema.String,
   -  }),
   -);
   +export default Table.make(() =>
   +  Schema.Struct({
   +    text: Schema.String,
   +  }),
   +);
   ```

2. Re-run `confect codegen`. The regenerated `_generated/schema.ts` switches back to static imports plus a record-style `DatabaseSchema.make({ ... })` call — no hand edits required.
3. If any code read `unnamed.Fields` or `unnamed.tableDefinition` directly off the `Table.make(...)` callable, switch to the bound `Table` (e.g. `Table.make(...)("notes").Fields`).
