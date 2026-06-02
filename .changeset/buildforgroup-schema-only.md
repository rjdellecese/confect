---
"@confect/server": major
"@confect/cli": major
---

Build per-group registered functions from the runtime `DatabaseSchema` value plus the group's own `GroupSpec` _type_, instead of the whole `Api` value and a dot-path into the project-wide spec.

`RegisteredFunctions.buildForGroup` now takes `(databaseSchema, groupLayer, makeRegisteredFunction)` with the group's `GroupSpec` supplied as a single explicit type argument (`buildForGroup<typeof groupSpec>(…)`), returning `RegisteredFunctionsForGroupSpec<Group>`. The old `api`/`groupPath` value parameters and the `Spec_` + `GroupPath_` navigation (`ForGroupPath`) are gone. `RegisteredConvexFunction.make` and `RegisteredNodeFunction.make` correspondingly take the `DatabaseSchema` value rather than the `Api`.

Codegen emits each `_generated/registeredFunctions/{path}.ts` importing the runtime schema (`import databaseSchema from "…/schema"`) and referencing the group's own leaf spec **type-only** (`typeof import("…/{group}.spec")["default"]`). Because the spec is only referenced in type position it is erased at transpile time, so a per-group registry no longer imports any spec module at runtime — removing the project-wide assembled-spec module (and every sibling spec it pulls in) from each function's cold-start bundle. Typing from the leaf `GroupSpec` also makes the registry's type depend solely on its own group rather than on the whole assembled `Spec`.

Author-facing `*.spec.ts` / `*.impl.ts` code is unchanged. Re-run `confect codegen` to regenerate `_generated/registeredFunctions/`.
