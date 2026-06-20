---
"@confect/core": minor
"@confect/cli": minor
---

You can now compile a Confect backend with TypeScript declaration emit and consume it as a project reference.

Previously, enabling `composite`/`declaration` on a project that included your generated `confect/_generated` modules failed with `TS7056` ("inferred type … exceeds the maximum length the compiler will serialize") once the backend had more than a handful of tables and functions. As a result, a Confect backend couldn't be a referenced/composite TypeScript project — every consumer had to pull in and recompile its source, hurting editor responsiveness and incremental typecheck times in larger workspaces.

Regenerating your backend (`confect codegen`) now produces `_generated` modules that emit declarations cleanly, so you can turn on `composite`/`declaration` for the backend and have downstream packages depend on it via project references (`.d.ts`) instead of source.
