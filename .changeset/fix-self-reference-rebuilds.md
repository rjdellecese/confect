---
"@confect/cli": patch
---

Fix repeated regeneration in `confect dev` when TypeScript files are imported through both relative paths and package self-references, and preserve self-reference `import` and `require` export conditions during code generation.
