---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Bump the Effect and Convex ecosystem dependencies:

- `effect` to 3.22.0 and `convex` to 1.42.1 across all packages.
- `@effect/platform` to `^0.97.0` and `@effect/platform-node` to `^0.108.0` (peer ranges in `@confect/server`, dependency ranges in `@confect/cli`). Consumers of `@confect/server` should have `@effect/platform` >=0.97.0 and `@effect/platform-node` >=0.108.0 installed.
- `@effect/typeclass`, `@effect/cli`, `@effect/printer`, and `@effect/printer-ansi` to their latest dependency-sync releases (`0.41.0`, `0.76.0`, and `0.50.0` respectively).
- `convex-test` to 0.0.54, now pinned via a `pnpm-workspace.yaml` override alongside `convex` and `effect`.

None of these introduce breaking changes.

Also fix a type error in `QueryRunner` and `MutationRunner` surfaced by the `convex` bump: convex 1.41.0 added a `transactionLimits` option to `GenericQueryCtx`/`GenericMutationCtx`'s nested `runQuery`/`runMutation` signatures, making them incompatible with the plain `GenericActionCtx` signature these services are actually invoked with from `HttpApi` handlers and registered functions. `QueryRunner` and `MutationRunner` now type their wrapped `runQuery`/`runMutation` against `GenericActionCtx`'s signature instead, restoring compatibility. No behavior change.
