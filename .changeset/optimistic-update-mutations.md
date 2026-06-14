---
"@confect/core": minor
"@confect/react": minor
---

Add `withOptimisticUpdate` to `@confect/react`'s `useMutation`, mirroring Convex's API. The mutation handle returned by `useMutation` is now both callable and exposes `.withOptimisticUpdate(fn)` for attaching an optimistic update. Inside the callback, the `OptimisticLocalStore`'s `getQuery`/`setQuery`/`getAllQueries` accept Confect query `Ref`s and operate on decoded (Effect Schema) values wrapped in `Option`; the wrapper handles encoding/decoding against Convex's local store.
