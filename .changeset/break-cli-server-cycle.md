---
"@confect/server": major
---

Renamed `DatabaseSchema.isSchema` to `DatabaseSchema.isDatabaseSchema` for consistency with the `is<TypeName>` predicate convention used elsewhere (e.g. `Spec.isSpec`). `TypeId` and `Any` are now defined in `@confect/core/DatabaseSchema` and re-exported from `@confect/server`; the underlying brand string is unchanged, so existing schema values continue to be recognized. Migration: replace `DatabaseSchema.isSchema(x)` with `DatabaseSchema.isDatabaseSchema(x)`.

Internally, this removes a cyclic workspace dependency between `@confect/cli` and `@confect/server` that triggered a pnpm install warning. `@confect/cli` no longer peer-depends on `@confect/server`.
