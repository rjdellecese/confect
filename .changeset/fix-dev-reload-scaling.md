---
"@confect/cli": patch
---

Reduce `confect dev` memory use and reload time, and speed up `confect codegen` in applications with many groups and tables. Development reloads no longer retain previously evaluated application modules. Implementation-only edits revalidate affected groups without reloading unrelated implementations; specification, table, and shared dependency edits regenerate only affected declarations and validate their implementations. Adding or removing files, changing configuration, and recovering from generation errors still trigger full generation.

Avoid redundant regeneration, dependency rebuilds, and Convex deployment retries while preserving edits made during startup or regeneration. Startup, error recovery, and explicit `confect codegen` still notify Convex when generated contents are unchanged.

Keep generated files up to date when optional sources are deleted while an implementation is invalid. Keep development watching active when directories disappear during discovery or watching, and report dependency watcher failures instead of announcing that generated files are up to date after a failed rebuild.
