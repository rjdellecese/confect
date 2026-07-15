---
"@confect/core": patch
---

Fix a TypeScript 6 type mismatch in `DeepMutable` for optional properties.

When compiled with TypeScript 6, `DeepMutable` kept the explicit `| undefined` on optional properties (e.g. `DeepMutable<{ readonly foo?: number | undefined }>` produced `{ foo?: number | undefined }`), where TypeScript 5.x treated that type as identical to `{ foo?: number }`. Exact-type comparisons against undefined-stripped shapes (such as those Convex validators infer) could therefore fail under TypeScript 6. Optional properties now strip their explicit `| undefined` on both compiler versions; required properties keep their declared type.
