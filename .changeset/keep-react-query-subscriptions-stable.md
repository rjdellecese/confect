---
"@confect/react": patch
---

Keep `useQuery` subscribed when a declared failure becomes a successful result, without calling a hook inside an error handler. Ignore repeated `useStreamPaginatedQuery` load requests for a page that has already advanced.
