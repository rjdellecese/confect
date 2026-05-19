---
"@confect/cli": patch
---

Fix `confect codegen` and `confect dev` failing with "Cannot find package '@confect/core'" / "'@confect/server'" when the user's spec or impl files are bundled. The internal esbuild plugin used `import.meta.resolve(specifier, parent)` to resolve external imports, but Node silently ignores the second argument, so resolution always walked up from the CLI's own bundled file instead of from the user's project. Switched to `createRequire` keyed on the importing file's directory so external packages resolve out of the user's `node_modules`.
