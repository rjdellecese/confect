---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.98` (from `^4.0.0-beta.97`).

`effect`'s `SchemaError` is now exposed as its own public module (`effect/SchemaError`), which changes the import path TypeScript picks when Confect emits `.d.ts` declarations that reference `Schema.SchemaError` (for example in generated `services.d.ts`). Existing `Schema.SchemaError` / `Schema.isSchemaError` usage is unaffected — this is purely a declaration-emit detail that consumers relying on generated types may notice.
