---
"@confect/server": major
"@confect/cli": major
"@confect/test": major
---

Pass a bound table to `DatabaseReader.table` and `DatabaseWriter.table` so a function can read and write documents without loading unrelated table definitions.

### Breaking Changes

- Import tables from their individual `_generated/tables/<name>` modules. For system reads, use `Table.storageTable` and `Table.scheduledFunctionsTable` from `@confect/server/Table`. Name-only operations such as `Id("notes")` and `DocumentIds.parse` still accept strings.
- Import the app-typed `FunctionImpl` and `MiddlewareImpl` builders from `_generated/server`. Remove the database schema argument from function, group, and middleware builders.
- When constructing services directly, pass only the native database to `DatabaseReader.make` and `DatabaseWriter.make`. For `DocumentIds.make` and `DocumentIds.layer`, pass `tableNames` from `_generated/tableNames` instead of the schema.
- Replace `TestConfect.layer(schema, convexSchema, modules)` with `TestConfect.layer<typeof schema>(convexSchema, modules)`, importing the Confect schema as a type.
- If a group declares only plain Convex functions, replace the default `GroupImpl` layer in its `.impl.ts` with named exports of the registered Convex functions. The generated entry re-exports only the names declared in the spec, without adding a Confect runtime dependency. Mixed groups still need the default finalized layer. Empty groups keep that layer and expose no endpoint.

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

If you already define your plain Convex functions in a separate module, re-export them from the group's `.impl.ts` (for example, `export { list, create } from "./notes"`). Keep type-only imports in the spec. Run `confect codegen` after migrating, then typecheck the generated entries against your implementations.
