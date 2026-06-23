---
"@confect/cli": patch
---

Fix `confect codegen` and `confect dev` failing with `ERR_MODULE_NOT_FOUND` when a first-party workspace dependency's compiled `dist` uses extensionless or directory-style relative imports.

Previously, every bare-specifier dependency in the spec/impl graph was externalized when bundling, so first-party workspace packages were handed to Node's native ESM resolver. That resolver requires fully-specified relative imports, so a linked workspace package whose `dist` relied on extensionless imports (valid for bundlers like Vite, esbuild, and Vitest) would crash codegen. First-party workspace dependencies are now bundled instead of externalized — detected by resolving each bare specifier and checking, via realpath, that it resolves outside `node_modules`, mirroring Vite's heuristic that linked dependencies are not externalized. True third-party `node_modules` dependencies remain external.

As a result, consumers no longer need post-emit extension-rewriting tooling such as `tsc-alias` or `rewriteRelativeImportExtensions` solely to satisfy codegen.
