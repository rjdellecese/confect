---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.101` (from `^4.0.0-beta.100`).

This is a peer-range-only change with no consumer-visible API consequences. The `beta.101` release only touches fiber/concurrency internals (interrupt handling in concurrent traversal, stack frame annotations, `awaitAllChildren` linearization, `interruptibleMask` interrupt delivery), a `MutableList.filter` fix for empty buckets, a `Schema.Struct` required-readonly-field type display simplification, and an `HttpRouter.toWebHandler` middleware type-inference tightening that Confect doesn't need to accommodate.
