---
"@confect/cli": patch
---

Fix repeated `confect dev` regeneration when relative imports and package self-references reach the same file, and preserve the package's distinct `import` and `require` export conditions during code generation.
