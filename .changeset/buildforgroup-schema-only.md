---
"@confect/server": major
"@confect/cli": major
---

Build per-group registered functions from the runtime `DatabaseSchema` value plus the spec _type_, instead of the whole `Api` value.

`RegisteredFunctions.buildForGroup` now takes `(databaseSchema, groupLayer, makeRegisteredFunction)` with the spec and group path supplied as explicit type arguments (`buildForGroup<Spec, "group.path">(…)`); the `api` value parameter and the `groupPath` string parameter are gone. `RegisteredConvexFunction.make` and `RegisteredNodeFunction.make` correspondingly take the `DatabaseSchema` value rather than the `Api`.

Codegen emits each `_generated/registeredFunctions/{path}.ts` importing the runtime schema (`import databaseSchema from "…/schema"`) and referencing the assembled spec **type-only** (`typeof import("…/spec")["default"]`). Because the spec is only referenced in type position it is erased at transpile time, so a per-group registry no longer imports the project-wide assembled spec module at runtime — removing those sibling-spec modules from each function's cold-start bundle.

Author-facing `*.spec.ts` / `*.impl.ts` code is unchanged. Re-run `confect codegen` to regenerate `_generated/registeredFunctions/`.
