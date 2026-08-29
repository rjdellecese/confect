---
"@confect/core": minor
"@confect/server": minor
"@confect/cli": minor
---

Move `Table.make` to `@confect/core` so a spec that returns `notes.Doc` from `_generated/tables/notes` no longer ships `@confect/server` to the client.

```ts confect/tables/notes.ts
import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    text: Schema.String,
  }),
);
```

`confect codegen` now fails if any module a spec reaches value-imports `@confect/server`, including `confect/tables/` and `_generated/`. Type-only imports remain allowed.
