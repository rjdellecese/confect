---
"@confect/cli": patch
"@confect/server": patch
---

Fix codegen emitting an invalid `interface … extends Document.Document<…>` in
`_generated/docs.ts` for tables whose document type is not a single object.

`Document.Document<Schema, Table>` is a type alias that resolves to whatever the
table's schema is, so for a `Schema.Union` table (or any non-object document:
branded primitives, `Schema.transform` results, …) it resolves to a union. An
`interface` cannot extend a union, so the generated `XDoc` tripped `TS2312` and
collapsed to an unusable type, which then broke every reader/writer helper that
printed it.

Codegen now emits a `type` alias per table — `export type NotesDoc =
Document.Document<typeof schemaDefinition, "notes">;` — which keeps the named
document type (so declaration emit still prints `NotesDoc` rather than the
expanded row) while supporting every document shape. Runtime behaviour is
unchanged.
