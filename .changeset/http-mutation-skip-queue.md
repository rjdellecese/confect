---
"@confect/js": minor
---

Add an optional `{ skipQueue: true }` third argument to `HttpClient.mutation` so independent HTTP mutations can bypass the client's default queue. Mutations remain queued when the option is omitted or false.
