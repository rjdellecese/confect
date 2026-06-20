---
"@confect/core": minor
"@confect/cli": minor
---

Make the generated `_generated/refs.ts`, `schema.ts`, and `spec.ts` modules declaration-emittable, fixing `TS7056` ("inferred type … exceeds the maximum length the compiler will serialize") under `tsc --build` with `composite`/`declaration` at scale.

These aggregate modules previously exported the _un-annotated_ result of a Confect builder call, so declaration emit had to infer and serialize the fully-expanded result type — every ref for `refs.ts`, the whole schema for `schema.ts`, and every function's arg/return schema for `spec.ts` — which trips `TS7056` once a backend has dozens of tables and functions. This blocked consuming a Confect backend as a referenced TypeScript project (so every consumer recompiled the backend's source).

Codegen now annotates each aggregate export with a compact, alias-headed type reference (mirroring `services.ts`/`docs.ts`), so declaration emit prints the reference by name instead of re-expanding it:

- `refs.ts` is typed with the new `Refs.FromSpec<typeof spec>`.
- `schema.ts` is typed with `DatabaseSchema.DatabaseSchema<…>` over the `typeof <table>` union.
- `spec.ts` is typed with a reconstructed `Spec.Spec<…>` whose groups are referenced by `typeof`; the new `GroupSpec.AddGroups` helper covers a leaf spec module that also has nested subgroups.

`@confect/core` gains two additive public types: `Refs.FromSpec` and `GroupSpec.AddGroups`.
