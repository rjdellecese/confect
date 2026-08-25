---
"@confect/core": minor
---

Declare Confect function arguments as lazy `Schema.Struct` field maps instead of constructed struct schemas. Confect now derives and builds the struct schema itself, matching Convex's object-only argument model and preserving exact field types through function specs and refs.
