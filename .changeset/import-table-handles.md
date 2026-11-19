---
"@confect/server": major
"@confect/cli": major
"@confect/test": major
---

Pass a bound table to `DatabaseReader.table` and `DatabaseWriter.table` so a function can read and write documents without loading unrelated table definitions. No data migration is needed: table definitions, document IDs, indexes, and function paths stay the same.

### Breaking Changes

- In each handler, helper, or middleware, default-import the tables it uses from their individual `_generated/tables/<name>` modules. For a runtime choice between tables, import just the candidates rather than the full schema. For system reads, use `Table._storage` and `Table._scheduled_functions` from `@confect/server/Table` (formerly `Table.storageTable` and `Table.scheduledFunctionsTable`).
- Import `FunctionImpl` and `MiddlewareImpl` from `_generated/server`; keep importing `GroupImpl` from `@confect/server`. Remove the runtime schema import and the first argument from `FunctionImpl.make`, `GroupImpl.make`, `MiddlewareImpl.make`, `MiddlewareImpl.provides`, and `MiddlewareImpl.makeByFunctionType`.
- Replace `TestConfect.layer(schema, convexSchema, modules)` with `TestConfect.layer<typeof schema>(convexSchema, modules)`, importing the Confect schema as a type.

Before:

```ts
import { FunctionImpl } from "@confect/server";
import schema from "./_generated/schema";

const list = FunctionImpl.make(schema, group, "list", () =>
  Effect.flatMap(DatabaseReader, (db) =>
    db.table("notes").index("by_creation_time").collect().pipe(Effect.orDie),
  ),
);
```

After:

```ts
import { FunctionImpl } from "./_generated/server";
import notes from "./_generated/tables/notes";

const list = FunctionImpl.make(group, "list", () =>
  Effect.flatMap(DatabaseReader, (db) =>
    db.table(notes).index("by_creation_time").collect().pipe(Effect.orDie),
  ),
);
```

Keep using table names for `Id("notes")`, `documentIds.parse("notes", input)`, `vectorSearch("notes", index, query)`, and native Convex calls such as `ctx.db.query("notes")`. When `documentIds.identify(input)` finds a match, its `table` field is still a name, not a handle.

Upgrade the Confect packages and CLI together. Regenerate bindings with `confect codegen` rather than editing them by hand, then typecheck your application.
