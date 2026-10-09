---
"@confect/cli": minor
---

Export an `Id<TableName>` type alongside the `Id` schema constructor in `confect/_generated/id`. After regenerating with `confect codegen`, use `Id<"notes">` to annotate IDs and `Id("notes")` to define their schemas. Both forms accept your declared table names and Convex system table names, including `"_storage"` and `"_scheduled_functions"`.

```ts
import type { Id } from "./confect/_generated/id";

type NoteProps = { noteId: Id<"notes"> };
```
