---
"@confect/cli": patch
---

Check `confect/http.ts`, `confect/crons.ts`, and `confect/auth.ts` for compilation errors during `confect codegen` and full `confect dev` generation, after their generated dependencies exist and without executing the optional modules.
