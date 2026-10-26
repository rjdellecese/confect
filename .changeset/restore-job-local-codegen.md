---
"@confect/cli": patch
---

Address the code-generation performance regression in `confect codegen` and `confect dev` while retaining the package self-reference fixes from 10.3.2: avoid repeated regeneration when relative imports and package self-references reach the same file, and preserve distinct `import` and `require` export conditions.

The configuration-resolution changes introduced in 10.3.2 are not retained. Restart `confect dev` manually after configuration, package metadata, or dependency installation changes.
