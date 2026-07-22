---
"@confect/server": patch
"@confect/cli": patch
---

Support Convex 1.41+, whose `runQuery`/`runMutation` on `GenericQueryCtx`/`GenericMutationCtx` gained a nested-transaction `transactionLimits` option that `GenericActionCtx`'s versions don't have. `QueryRunner.layer`/`MutationRunner.layer` were typed against the wider `GenericQueryCtx`/`GenericMutationCtx` signatures, so passing an action's `runQuery`/`runMutation` (the only way they're actually used to build an action's services) stopped typechecking against Convex 1.41+. They're now typed against `GenericActionCtx`, matching how they're actually called; no public API or behavior change.

Also raise the `@effect/platform`/`@effect/platform-node` peer floor in `@confect/server` to `^0.97.0`/`^0.108.0`, and the `@effect/cli`/`@effect/platform`/`@effect/platform-node`/`@effect/printer`/`@effect/printer-ansi` dependency floors in `@confect/cli` to their matching latest releases. These are 0.x packages whose caret ranges only tolerate patch bumps, so keeping `effect` at 3.22.0 forced these dependency-sync releases along with it — consumers pinned below these floors will need to upgrade them too.
