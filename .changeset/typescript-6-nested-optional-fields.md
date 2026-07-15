---
"@confect/server": patch
---

Fix a TypeScript 6 type mismatch for schemas with nested optional fields.

When compiled with TypeScript 6, the document types Confect derives for schemas containing nested optional fields (e.g. `{ foo: { bar?: number | undefined } }`) picked up a stray `| undefined` on those fields, so they no longer lined up with the types Convex infers for the equivalent validators. This could surface as type errors wherever a Confect-derived validator or document type meets a Convex one. The derived types are now identical under TypeScript 5.x and 6.x.
