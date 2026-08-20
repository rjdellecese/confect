---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.107` (from `^4.0.0-beta.106`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

`beta.107` is a patch-only Effect release, so no Confect API changes and no call-site edits are needed — upgrade `effect` alongside `@confect/*` and everything you have written keeps compiling. Your table, argument, and returns schemas still produce the same Convex validators.

Two Effect fixes are worth knowing about if they touch your code. HTTP actions written with `HttpRouter` now collect uploaded file contents far faster on large multipart bodies, and a file part whose stream is cut short — because a parser limit was exceeded or the request body ended early — now fails instead of hanging. Separately, `Duration` values that are equal now hash equally, so a `Duration` used as a `HashMap` key or a `HashSet` member is found regardless of which constructor built it.
