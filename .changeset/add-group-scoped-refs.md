---
"@confect/core": minor
"@confect/cli": minor
---

Add generated `_generated/refs/<group-path>` imports for referencing a filesystem group subtree without importing the aggregate spec, and `Refs.fromGroup(namespace, group)` with `Refs.FromGroup<Group>` for constructing group-relative references directly. Existing `_generated/refs` imports remain unchanged.

```ts
import refs from "./confect/_generated/refs/notes_and_random/notes";

const list = refs.public.list;
```
