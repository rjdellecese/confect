---
"@confect/server": major
---

`FunctionImpl.make` and `GroupImpl.make` now take the runtime `DatabaseSchema` (the default export of `_generated/schema.ts`) as their first argument instead of the whole `Api`.

The handler's ctx-service types (`DatabaseReader`, `QueryCtx<DataModel>`, …) only ever depended on the database schema, never on the spec, so `make` now asks for exactly that. The argument remains a type-level carrier — it isn't read at runtime — but switching impls to import `_generated/schema` instead of `_generated/api` removes `_generated/spec.ts` (and the function specs it transitively imports) from every per-function bundle. Combined with the registry change that references the spec type-only, a Convex function's cold-start bundle no longer pulls in any sibling group's spec.

Author migration — in each `*.impl.ts`, import the database schema and pass it where you previously passed `api`/`nodeApi`:

```diff
- import api from "../_generated/api";        // (or nodeApi from "../_generated/nodeApi")
+ import databaseSchema from "../_generated/schema";

- const insert = FunctionImpl.make(api, notes, "insert", handler);
+ const insert = FunctionImpl.make(databaseSchema, notes, "insert", handler);

- export default GroupImpl.make(api, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
+ export default GroupImpl.make(databaseSchema, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
```

Node impls migrate identically (from `nodeApi` to the same `_generated/schema`); only their specs differ (`GroupSpec.makeNode()`). `_generated/api.ts` / `_generated/nodeApi.ts` are still emitted (the combined `Api` value) but are no longer imported by generated or impl code.
