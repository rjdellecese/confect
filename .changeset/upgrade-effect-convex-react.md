---
"@confect/server": patch
---

Support Convex 1.41+, whose `runQuery`/`runMutation` on `GenericQueryCtx`/`GenericMutationCtx` gained a nested-transaction `transactionLimits` option that `GenericActionCtx`'s versions don't have. `QueryRunner.layer`/`MutationRunner.layer` were typed against the wider `GenericQueryCtx`/`GenericMutationCtx` signatures, so passing an action's `runQuery`/`runMutation` (the only way they're actually used to build an action's services) stopped typechecking against Convex 1.41+. They're now typed against `GenericActionCtx`, matching how they're actually called; no public API or behavior change.
