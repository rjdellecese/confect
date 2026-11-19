---
"@confect/server": major
"@confect/cli": major
"@confect/test": major
---

Pass a bound table to `DatabaseReader.table` and `DatabaseWriter.table` so a function can read and write documents without loading unrelated table definitions. No data migration is needed: table definitions, document IDs, indexes, and function paths stay the same.

### Breaking Changes

- In each handler, helper, or middleware, default-import the tables it uses from their individual `_generated/tables/<name>` modules. For a runtime choice between tables, import just the candidates rather than the full schema. For system reads, use `Table._storage` and `Table._scheduled_functions` from `@confect/server/Table` (formerly `Table.storageTable` and `Table.scheduledFunctionsTable`).
- Import your implementation builders (`FunctionImpl`, `GroupImpl`, and `MiddlewareImpl`) from `_generated/server`. Remove the runtime schema import and the database schema argument from builder calls.
- Replace `TestConfect.layer(schema, convexSchema, modules)` with `TestConfect.layer<typeof schema>(convexSchema, modules)`, importing the Confect schema as a type.

By convention, default-import application tables as `<name>Table` and group specs as `<name>Spec`. These are local names, not changes to the table or function paths.

Before:

```ts
import { FunctionImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import schema from "./_generated/schema";
import { DatabaseReader } from "./_generated/services";
import notesSpec from "./notes.spec";

const list = FunctionImpl.make(schema, notesSpec, "list", () =>
  Effect.flatMap(DatabaseReader, (db) =>
    db.table("notes").index("by_creation_time").collect().pipe(Effect.orDie),
  ),
);
```

After:

```ts
import * as Effect from "effect/Effect";
import { FunctionImpl } from "./_generated/server";
import { DatabaseReader } from "./_generated/services";
import notesTable from "./_generated/tables/notes";
import notesSpec from "./notes.spec";

const list = FunctionImpl.make(notesSpec, "list", () =>
  Effect.flatMap(DatabaseReader, (db) =>
    db.table(notesTable).index("by_creation_time").collect().pipe(Effect.orDie),
  ),
);
```

Keep using table names for `Id("notes")`, `documentIds.parse("notes", input)`, `vectorSearch("notes", index, query)`, and native Convex calls such as `ctx.db.query("notes")`. When `documentIds.identify(input)` finds a match, its `table` field is still a name, not a handle.

Upgrade the Confect packages and CLI together. Regenerate bindings with `confect codegen` rather than editing them by hand, then typecheck your application.
