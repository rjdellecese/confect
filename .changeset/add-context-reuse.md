---
"@confect/core": minor
"@confect/cli": minor
---

Add `GroupSpec.make({ experimental_reuseContext: true })` to opt a group's queries and mutations into Convex's experimental V8 context reuse through `confect codegen` and `confect dev`. Reuse is disabled by default, does not apply to actions or child groups, and requires auditing module-level state for safety across calls and users.
