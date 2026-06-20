---
"@confect/core": patch
"@confect/cli": patch
---

Fix `TS7056` ("inferred type … exceeds the maximum length the compiler will serialize") when compiling a Confect backend with declaration emit.

Enabling `composite`/`declaration` on a project that included your generated `confect/_generated` modules failed with `TS7056` once the backend had more than a handful of tables and functions. This prevented a Confect backend from being a referenced/composite TypeScript project — every consumer had to pull in and recompile its source, hurting editor responsiveness and incremental typecheck times in larger workspaces.

Regenerating your backend (`confect codegen`) now produces `_generated` modules that emit declarations cleanly, so you can turn on `composite`/`declaration` for the backend and have downstream packages depend on it via project references (`.d.ts`) instead of source.
