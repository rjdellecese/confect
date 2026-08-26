---
"@confect/core": minor
---

Declare Confect function arguments as optional lazy `Schema.Struct` field maps instead of constructed struct schemas. Confect now derives and builds the struct schema itself, defaults omitted args to `{}`, matches Convex's object-only argument model, and preserves exact field types through function specs and refs.
