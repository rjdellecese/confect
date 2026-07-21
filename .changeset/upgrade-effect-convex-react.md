---
"@confect/core": patch
"@confect/server": patch
"@confect/react": patch
"@confect/js": patch
"@confect/cli": patch
"@confect/test": patch
---

Upgrade deps: `effect` to 3.22.0, `convex` to 1.42.3, `react`/`react-dom` to 19.2.7, `convex-test` to 0.0.54, and `@effect/platform` to 0.96.3. No peer dependency ranges changed.

Fix `QueryRunner`/`MutationRunner`'s action-layer constructors to accept only the `runQuery`/`runMutation` shape actually available in a Convex action, matching the narrower signature convex 1.41.0 introduced for `GenericActionCtx` (which does not support the new nested-transaction `transactionLimits` option that `GenericQueryCtx`/`GenericMutationCtx` gained). This is an internal typing correction with no change to `QueryRunner`/`MutationRunner`'s public API or runtime behavior.
