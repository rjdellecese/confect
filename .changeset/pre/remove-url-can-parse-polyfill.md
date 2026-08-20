---
"@confect/server": patch
---

Drop the `URL.canParse` polyfill that `@confect/server` installed on import in the `10.0.0-next.7` through `10.0.0-next.9` prereleases. It worked around the Convex UDF isolate's `URL` lacking the static `URL.canParse` that Effect's `Schema.URLFromString` decode relies on; the Convex runtime [now implements `URL.canParse` and `URL.parse`](https://github.com/get-convex/convex-backend/issues/510), so patching the global is no longer needed. `@confect/server`'s entry modules are side-effect-free again.
