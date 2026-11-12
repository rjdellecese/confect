---
"@confect/core": minor
"@confect/cli": minor
---

Add `GroupSpec.make({ root: true })` and `GroupSpec.makeNode({ root: true })` to expose one top-level group's functions directly on `refs.public` and `refs.internal` without changing their deployed Convex addresses. `confect codegen` and `confect dev` reject multiple roots, nested roots, and conflicting ref names; passing `name` together with `root: true` is disallowed.
