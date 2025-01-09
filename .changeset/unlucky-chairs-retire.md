---
"@rjdellecese/confect": patch
---

Initial support for recursive schemas.

Current caveats:

- Recursive schemas will be converted to `v.any()` Convex validators (you still get the same type-safety you expect when reading/writing to the DB, as long as you use the Confect APIs.
- One consequence of the above is that type-checking for indexes (both when defining and using) on tables with a recursive schema will be unavailable.
