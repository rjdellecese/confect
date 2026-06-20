---
"@confect/server": patch
---

Fix `db.patch`, `db.replace`, and `db.insert` rejecting branch-specific fields on tables whose schema is a `Schema.Union`.

Writing a field that only exists on one member of the union (e.g. patching `status` on the `Dropship` branch of a union-typed `orders` table) failed to typecheck — only the fields common to every member were accepted. These operations now accept every branch's fields. This also unblocks consuming a Confect backend as a referenced/composite TypeScript project, which previously failed to emit declarations because of these errors.
