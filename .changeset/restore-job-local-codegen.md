---
"@confect/cli": patch
---

Address the code-generation performance regression in `confect codegen` and `confect dev` while preserving package self-reference handling and consistent entry-specific and inherited `tsconfig.json` settings, including path aliases and compiler options from shared configuration packages.

Relative imports and package self-references to the same file do not cause repeated regeneration, and code generation preserves distinct `import` and `require` export conditions.

Restart `confect dev` manually after configuration, package metadata, or dependency installation changes.
