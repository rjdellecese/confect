---
"@confect/server": minor
---

Add support for `Config` usage in Convex runtime functions. Effect's default `ConfigProvider` doesn't work because `process.env` is not enumerable in the Convex runtime. The new `ConvexConfigProvider` supports the same options as Effect's default `ConfigProvider.fromEnv`, but is also provided to Convex runtime functions by default. Configs which require enumeration are still unsupported, until/unless this Convex runtime limitation is removed.
