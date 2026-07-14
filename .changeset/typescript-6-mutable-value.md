---
"@confect/server": patch
---

Strip explicit `undefined` from nested optional properties in `ValueToValidator`'s computed document types, restoring agreement with Convex's own validator types under TypeScript 6.

Under TypeScript 5.x with `exactOptionalPropertyTypes`, homomorphic mapped types silently dropped `undefined` from optional property types, so `ValueToValidator<{ foo: { bar?: number | undefined } }>` already produced a validator over `{ foo: { bar?: number } }` — the same shape `v.object()` infers. TypeScript 6 preserves the explicit `| undefined`, which made the two types diverge for schemas with nested optional fields. The internal `MutableValue` type now excludes `undefined` from optional properties explicitly, matching the behavior on both compiler versions.
