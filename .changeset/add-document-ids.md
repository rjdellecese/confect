---
"@confect/server": minor
"@confect/cli": minor
---

Add the generated `DocumentIds` service for queries and mutations: `parse` validates a string for a specific table, and `identify` discovers its table among known application and public system tables.

Each operation returns an `Option` inside an Effect. Both accept only IDs already in their canonical format; neither fetches a document nor proves that it exists.

Import the service from your generated services module. Use `parse` when you expect the input to be an ID for a particular table:

```ts
import * as Effect from "effect/Effect";
import { DocumentIds } from "./confect/_generated/services";

const parseNoteId = (input: string) =>
  Effect.gen(function* () {
    const documentIds = yield* DocumentIds;
    return yield* documentIds.parse("notes", input);
  });
```

Use `identify` when you do not know the table. Match the result to handle an unrecognized ID or use the identified table and ID:

```ts
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { DocumentIds } from "./confect/_generated/services";

const describeDocumentId = (input: string) =>
  Effect.gen(function* () {
    const documentIds = yield* DocumentIds;
    const identifiedId = yield* documentIds.identify(input);

    return Option.match(identifiedId, {
      onNone: () => "No known table matches this ID",
      onSome: (matchedId) => `${matchedId.table}: ${matchedId.id}`,
    });
  });
```
