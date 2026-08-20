---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-rc.109` (from `^4.0.0-rc.108`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

No Confect API changed, and no call-site edits are needed. `rc.109` is a patch release of Effect with nothing removed or renamed, so upgrading is a matter of installing it alongside `@confect/*`.
