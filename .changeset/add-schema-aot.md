---
"@confect/cli": minor
"@confect/core": patch
---

Add experimental `--schema-aot` support to `confect codegen` and `confect dev` to prepare schema parsers ahead of time while preserving lazy table schemas and interpreter fallbacks.

Regenerate with the flag after changing schemas or upgrading Effect. Run codegen without the flag to restore interpreted parsing.
