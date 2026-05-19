---
"@confect/cli": minor
"@confect/core": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
---

Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

`@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.
