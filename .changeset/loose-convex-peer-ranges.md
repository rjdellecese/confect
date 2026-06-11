---
"@confect/cli": patch
"@confect/core": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
---

Loosen and align dependency ranges across all packages:

- The `convex` peer dependency is now `^1.32.0` in every package (previously pinned exactly to `1.39.1`, or `^1.30.0` in `@confect/react`). The range is validated against convex 1.32.0 through 1.40.0.
- `@confect/server`'s `@effect/platform-node` peer dependency is now optional — it is only needed when using the `@confect/server/node` entrypoint.
- `@confect/cli` now uses caret ranges for its `@effect/platform` and `@effect/platform-node` dependencies so they can deduplicate with the versions resolved for `@confect/server`, and no longer declares an unused direct dependency on `@effect/platform-node-shared`.
- `@confect/test` now accepts any `convex-test` release in `>=0.0.50 <0.1.0` instead of exactly 0.0.50.
