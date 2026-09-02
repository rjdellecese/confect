---
"@confect/server": patch
---

Fix `DatabaseWriter`'s `patch` rejecting `undefined` for optional fields under `exactOptionalPropertyTypes`.

Setting an optional field to `undefined` in a patch unsets it, but the argument was typed as a plain `Partial` of the document, so `writer.table("notes").patch(id, { tag: undefined })` was a type error in projects with `exactOptionalPropertyTypes` enabled. Optional fields now accept `undefined`; required fields still don't, since unsetting one would leave a document the table's schema rejects.
