---
"@confect/server": minor
---

Use the generated `VectorSearch` service in HTTP handlers and middleware with schema-typed tables, indexes, and filters. If your routes need an explicit application model, use `HttpRouter.make<typeof schema>(routes)` with a type-only import of the generated schema.
