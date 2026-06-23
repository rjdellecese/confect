---
"@confect/cli": patch
---

Fix `confect codegen` and `confect dev` failing with `ERR_MODULE_NOT_FOUND` when your spec or impl files import a workspace package from the same monorepo.

Codegen now handles workspace dependencies whose compiled output uses extensionless or directory-style relative imports — output that already works everywhere else (Vite, esbuild, Vitest). You no longer need extension-rewriting tooling such as `tsc-alias` or `rewriteRelativeImportExtensions` just to make codegen succeed.
