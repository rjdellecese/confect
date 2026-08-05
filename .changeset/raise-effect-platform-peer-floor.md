---
"@confect/server": minor
"@confect/cli": patch
---

Raise `@confect/server`'s `@effect/platform` peer dependency floor to `^0.97.1`, and its optional `@effect/platform-node` peer to `^0.108.1`. If you are on `@effect/platform` 0.96.x, upgrade it alongside this release: the Effect ecosystem treats each `0.x` minor as its own compatibility line, so a project resolving both 0.96 and 0.97 gets duplicate-package type errors rather than a working install.

`@confect/cli` moves its own dependencies onto the same line — `@effect/cli` `^0.77.0`, `@effect/platform` `^0.97.1`, `@effect/platform-node` `^0.108.1`, `@effect/printer` and `@effect/printer-ansi` `^0.51.0`, and `exsolve` `^1.1.1`. No action is needed unless you depend on those packages directly.
