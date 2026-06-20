---
"@confect/server": patch
---

Fix union-schema table documents dropping branch-specific fields under `WithoutSystemFields`, so `db.patch`/`db.replace`/`db.insert` reject branch-specific fields with `TS2353` (e.g. patching `status` on the `Dropship` branch of a union-typed `orders` table).

This is a second issue in the same union-document area as the 9.1.1 codegen `type`-alias fix. For a table whose schema is a `Schema.Union` (a discriminated union of structs), the public document type was composed as `SystemFields & (A | B)` — system fields intersected with the whole union — instead of being distributed as `(SystemFields & A) | (SystemFields & B)`. Since `keyof (A | B)` is only the keys common to every member, `WithoutSystemFields<Doc> = Omit<Doc, "_id" | "_creationTime">` kept only the common fields and dropped every branch-specific field. This regressed in 9.1.0/9.1.1 and worked on 9.0.2; it also blocked consuming a Confect backend as a composite/referenced TypeScript project, since the backend's own declaration emit errored at those call sites.

The system fields are now distributed over each union member when composing the public document type, and `Document.WithoutSystemFields` distributes over the document union so `Omit`/`Partial` preserve each branch's fields. Runtime behaviour is unchanged (type-level only).
