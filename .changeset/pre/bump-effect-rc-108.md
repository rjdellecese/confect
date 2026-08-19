---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-rc.108` (from `^4.0.0-beta.107`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise. Effect v4 has left beta for release candidates, so `effect@rc` is now the tag to install alongside `@confect/*`.

No Confect API changed, and no call-site edits are needed for Confect itself. One Effect change can reach your code: the standalone `effect/SchemaError` module is gone, and `SchemaError` is now exported from `Schema`. Confect still fails decoding with the same error, so this only matters if you name the type when handling it.

Before:

```ts
import type { SchemaError } from "effect/SchemaError";
```

After:

```ts
import type { SchemaError } from "effect/Schema";
```

Also worth knowing if you serve an `HttpApi`: a query parameter declared as an array now decodes correctly when a request supplies exactly one value for it.

One internal change rides along. Queries and mutations that run long enough to trigger a cooperative fiber yield now take that yield from Effect's own scheduler, which `rc.108` made usable inside Convex's isolate for the first time. The underlying microtask primitive is identical, so behavior should not change — but it is the thing to look at if a long-running query or mutation regresses on this release.
