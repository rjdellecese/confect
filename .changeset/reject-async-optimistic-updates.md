---
"@confect/react": major
---

Reject promise-returning callbacks passed to `useMutation(ref).withOptimisticUpdate(...)` at compile time.

### Breaking Changes

- Optimistic callbacks with an inferred or declared `Promise` return type no longer typecheck. Synchronous callbacks remain supported, including callbacks typed as returning `void`.

To migrate, perform asynchronous preparation before invoking the mutation and keep the optimistic update synchronous. Removing `async` is sufficient when the callback does no asynchronous work.

**Before:**

```ts
const mutate = useMutation(ref).withOptimisticUpdate(async (store, args) => {
  updateCache(store, args);
});
```

**After:**

```ts
const mutate = useMutation(ref).withOptimisticUpdate((store, args) => {
  updateCache(store, args);
});
```

This is a type-level check, not runtime validation: it cannot detect a promise return already erased to `void` by a caller's annotation.
