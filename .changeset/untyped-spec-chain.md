---
"@confect/cli": patch
---

Fix `confect/_generated/spec.ts` failing to typecheck with "Type instantiation is excessively deep and possibly infinite" (TS2589) once an app has 48 or more top-level groups, or a group has about 90 or more child groups. The generated spec already declares its full type, so its builder chain is now cast to `any` instead of being inferred one nested type per group. `refs` stays precisely typed. Run `confect codegen` to regenerate.
