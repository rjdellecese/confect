---
"@confect/cli": patch
---

Fix `confect dev` recovery after an initial generation failure: keep watching table and spec dependencies even when generated bindings or a sibling implementation are missing, so fixing those files retries generation without restarting. Incomplete spec/implementation pairs still report an error until both files are valid.
