---
"@confect/cli": patch
---

Keep module resolution and inherited TypeScript configuration consistent between `confect codegen` and `confect dev`. Restart `confect dev` automatically when configuration or dependency-resolution inputs change, while keeping ordinary source edits incremental and avoiding regeneration for unchanged inputs. Reduce entry-file resolution overhead in both commands and verification overhead for dev updates without missing dependency or configuration changes.

Fix `${configDir}` aliases with wildcard matches followed by `..` so they resolve to the matched directory's parent.
