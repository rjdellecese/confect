---
"@confect/server": minor
---

Route `Effect.log*` output to matching Convex log severities in function handlers and HTTP routes, retaining Effect metadata and custom logger overrides. Add `ConvexLogger` for explicit logger configuration, and keep logs attached to the current invocation when Node actions reuse a process.
