---
"@confect/server": minor
"@confect/cli": minor
---

Add the generated `DocumentIds` service for queries and mutations: `parse` validates a string for a specific table, `identify` discovers its table among known application and public system tables, and `normalize` explicitly supports legacy ID conversion.

Each operation returns an `Option` inside an Effect. Parsing and identification accept only IDs already in their canonical format; none of these operations fetches a document or proves that it exists.
