---
"@confect/core": patch
---

Stop reporting a nested struct as recursive when it is merely assignable to one of its ancestors. `IsRecursive` compared a type against the types above it by assignability, so a struct nested under a parent whose extra fields are all optional (for example `{ badge: string }` inside `{ badge: string; rows?: { badge: string }[] }`) was treated as a cycle: its validator type became `VAny`, and a table built from it had a `never` document type and rejected its own index fields. Types already on the path are now compared by identity.
