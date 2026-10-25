---
"@confect/server": minor
"@confect/cli": minor
---

Add the generated `DocumentIds` service for queries and mutations: `parse` validates a string for a specific table, and `identify` discovers its table among known application and public system tables.

Each operation returns an `Option` inside an Effect. Both accept only IDs already in their canonical format; neither fetches a document nor proves that it exists.

Add `DatabaseSchema.SystemTableNames` for public system tables and `DatabaseSchema.AllTableNames` for application and public system tables. `DatabaseSchema.TableNames` continues to represent application tables.
