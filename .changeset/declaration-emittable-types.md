---
"@confect/server": minor
"@confect/cli": minor
---

Make Confect's public types declaration-emittable, fixing `TS7056` under
`tsc --build` with `composite`/`declaration` (e.g. consuming a Confect backend
as a referenced TypeScript project).

The schema-generic service tags (`DatabaseReader`, `DatabaseWriter`,
`VectorSearch`, `QueryCtx`/`MutationCtx`/`ActionCtx`) now back their
`Context.GenericTag` with named generic interfaces, and codegen annotates the
`_generated/services.ts` exports with the corresponding tag aliases — so
declaration emit prints the names by reference instead of re-expanding the
whole data model (the example backend's `services.d.ts` drops from ~307 KB to
~5.6 KB).

Codegen also emits `_generated/docs.ts` — a nominal `interface` per table plus
a `Docs` registry — threaded into the reader/writer tags via the new
`Confect.Doc<Schema, Table>` helper, so query/mutation helpers print named
document types (e.g. `NotesDoc`) with no added annotations. Runtime behaviour is
unchanged.
