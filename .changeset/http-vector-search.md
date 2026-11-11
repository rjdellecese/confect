---
"@confect/server": major
---

Require a database schema when constructing an HTTP router, enabling the generated `VectorSearch` service in handlers and middleware with schema-typed tables, indexes, and filters.

### Breaking Changes

- `HttpRouter.make(routes)` is removed. Pass the generated runtime database schema as the first argument, even when routes do not use vector search.

To migrate, import the runtime schema from `./_generated/schema` in `confect/http.ts` and pass it before your existing routes.

**Before:**

```ts
export default ConfectHttpRouter.make(routes);
```

**After:**

```ts
import databaseSchema from "./_generated/schema";

export default ConfectHttpRouter.make(databaseSchema, routes);
```
