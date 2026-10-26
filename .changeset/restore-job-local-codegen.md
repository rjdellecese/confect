---
"@confect/cli": patch
---

Restore the 10.3.1 behavior of `confect codegen` and `confect dev` to address the code-generation performance regression.

The package self-reference and configuration-resolution changes introduced in 10.3.2 are not retained. Restart `confect dev` manually after configuration, package metadata, or dependency installation changes.
