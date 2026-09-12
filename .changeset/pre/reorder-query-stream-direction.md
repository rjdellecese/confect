---
"@confect/server": major
---

Move `QueryStream`'s `Direction` type parameter from fifth to third. Update explicit type annotations to place the direction before the error and service requirements; inferred types and runtime behavior are unchanged.

**Before:**

```ts
QueryStream<Doc, Key, Error, Requirements, Direction>;
```

**After:**

```ts
QueryStream<Doc, Key, Direction, Error, Requirements>;
```

If an annotation previously omitted `Direction` but specified an error or requirements, insert `QueryStreamOrderDirection.QueryStreamOrderDirection` as the third argument to continue accepting either direction.
