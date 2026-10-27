---
"@confect/cli": patch
---

Fix the 10.3.2 code-generation performance regression affecting `confect codegen` and `confect dev`.

Restart `confect dev` manually after changing TypeScript configuration, package metadata, or installed dependencies. Ordinary source edits continue to update automatically.

Resolve `${configDir}` path aliases consistently with TypeScript when `..` follows a wildcard. For example, with `"@/*": ["${configDir}/fixtures/*/../value.ts"]`, an import of `@/a/b` resolves to `fixtures/value.ts`, not `fixtures/a/value.ts`.
