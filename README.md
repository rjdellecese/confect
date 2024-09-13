# Confect 🧁

🚧 **This library is pre-1.0 and its API is not yet stable.** 🚧

Confect is a library that deeply integrates the [Effect](https://effect.website) ecosystem with [Convex](https://convex.dev), unlocking a number of powerful new capabilities.

## Features

### Available today

- Define your Convex database schema using Effect schemas.
- Use Confect functions to automatically decode and encode your data according to your Effect schema definitions when reading from and writing to the database.
- Write Convex function `args` and `returns` validators using Effect's Schema library.
- Use Effectified versions of all of the Convex server APIs (`Promise`s become `Effect`s, `A | null` becomes `Option<A>`s, etc.).

### Coming soon

- Effect HTTP API integration, including auto-generated API documentation via Scalar.
- Enhanced `db` APIs.
- Row-level security.
- And more!

## Installation

```bash
npm install @rjdellecese/confect
```

```bash
yarn add @rjdellecese/confect
```

```bash
pnpm add @rjdellecese/confect
```

## Usage

### 1. Define your Convex database schema using Effect schemas

```typescript
import { Schema } from "@effect/schema";
import {
  defineSchema,
  defineTable,
  tableSchemas,
} from "@rjdellecese/confect/schema";
import { Id } from "@rjdellecese/confect/schemas";

export const confectSchema = defineSchema({
  notes: defineTable(
    Schema.Struct({
      userId: Schema.optionalWith(Id.Id<"users">(), {
        exact: true,
      }),
      text: Schema.String.pipe(Schema.maxLength(100)),
      tag: Schema.optionalWith(Schema.String, { exact: true }),
      author: Schema.optionalWith(
        Schema.Struct({
          role: Schema.Literal("admin", "user"),
          name: Schema.String,
        }),
        { exact: true },
      ),
      embedding: Schema.optionalWith(Schema.Array(Schema.Number), {
        exact: true,
      }),
    }),
  )
    .index("by_text", ["text"])
    .index("by_role", ["author.role"])
    .searchIndex("text", {
      searchField: "text",
      filterFields: ["tag"],
    })
    .vectorIndex("embedding", {
      vectorField: "embedding",
      filterFields: ["author.name", "tag"],
      dimensions: 1536,
    }),
  users: defineTable(
    Schema.Struct({
      username: Schema.String,
    }),
  ),
});

export const confectTableSchemas = tableSchemas(confectSchema.confectSchema);

export default confectSchema.schemaDefinition;

```

### 2. Generate your Convex function constructors and types

```typescript
import type {
  ConfectActionCtx as ConfectActionCtxType,
  ConfectMutationCtx as ConfectMutationCtxType,
  ConfectQueryCtx as ConfectQueryCtxType,
} from "@rjdellecese/confect/ctx";
import type {
  ConfectDoc as ConfectDocType,
  TableNamesInConfectDataModel,
} from "@rjdellecese/confect/data-model";
import { makeFunctions } from "@rjdellecese/confect/functions";
import type { ConfectDataModelFromConfectSchemaDefinition } from "@rjdellecese/confect/schema";

import { confectSchema } from "./schema";

export const {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} = makeFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

export type ConfectQueryCtx = ConfectQueryCtxType<ConfectDataModel>;

export type ConfectMutationCtx = ConfectMutationCtxType<ConfectDataModel>;

export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
```

### 3. Write some Convex functions

```typescript
import { Schema } from "@effect/schema";
import { Id } from "@rjdellecese/confect/schemas";

import { query } from "./confect";
import { confectTableSchemas } from "./schema";

export const getNote = query({
  args: Schema.Struct({
    noteId: Id.Id<"notes">(),
  }),
  returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
  handler: ({ db }, { noteId }) => db.get(noteId),
});
```
