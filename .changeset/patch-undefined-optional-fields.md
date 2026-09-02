---
"@confect/server": patch
---

Fix `patch` rejecting `undefined` for optional fields under `exactOptionalPropertyTypes`.

Setting an optional field to `undefined` unsets it, but `writer.table("notes").patch(noteId, { tag: undefined })` was a type error in projects with `exactOptionalPropertyTypes` enabled. Optional fields now accept `undefined`; required fields still don't, since unsetting one would leave a document the table's schema rejects.
