---
"@confect/cli": patch
---

Reduce `confect dev` memory use and reload time in large apps, and speed up `confect codegen`. Impl-only edits revalidate affected groups without reloading unrelated implementations.

Keep generated files up to date when dependencies change during startup or optional sources are deleted while an implementation is invalid.
