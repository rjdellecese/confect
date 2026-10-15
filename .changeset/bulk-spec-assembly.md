---
"@confect/core": major
"@confect/cli": patch
---

Reduce the initialization cost of generated function references in projects with many groups.

Fix `confect/_generated/spec.ts` failing to typecheck with "Type instantiation is excessively deep and possibly infinite" (TS2589) in projects with many top-level or child groups, while keeping `refs` precisely typed.

### Breaking Changes

- Existing generated files are no longer compatible with the updated packages. Run `confect codegen` after upgrading to regenerate them. User-authored group definitions using `GroupSpec.make()`, `GroupSpec.makeNode()`, `.addFunction()`, and `.middleware()` do not need to change.
