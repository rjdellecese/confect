---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/foldkit": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-rc.112` (from `^4.0.0-rc.111`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

No Confect API changed, and no call-site edits are needed. `rc.112` adds to Effect's surface without removing or renaming anything, so upgrading is a matter of installing it alongside `@confect/*`.
