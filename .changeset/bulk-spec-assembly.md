---
"@confect/core": major
"@confect/cli": patch
---

Reduce the initialization cost of generated function references in projects with many groups.

### Breaking Changes

- Existing generated files are no longer compatible with the updated packages. Run `confect codegen` after upgrading to regenerate them. User-authored group definitions using `GroupSpec.make()`, `GroupSpec.makeNode()`, `.addFunction()`, and `.middleware()` do not need to change.
