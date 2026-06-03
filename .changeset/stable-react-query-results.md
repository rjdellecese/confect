---
"@confect/react": patch
"@confect/core": patch
---

Stabilize the identity of `@confect/react` hook results across renders.

`useQuery` previously decoded and wrapped the Convex result on every render, handing consumers a brand new `QueryResult` even when the underlying Convex data was unchanged. Effects and memoization that depend on the result's identity (e.g. `useEffect(..., [user])` derived via `QueryResult.match`) would re-run on every render, which could escalate into `Maximum update depth exceeded`. The decoded `QueryResult` is now memoized by the (referentially stable) Convex result, so unchanged data keeps a stable identity.

`useMutation` and `useAction` now return a stable callback via `useCallback`, matching the identity contract of Convex's own hooks, instead of allocating a fresh function each render.

`Ref.getFunctionReference` now caches the Convex function reference by function name, so repeated calls for the same ref return the same reference.
