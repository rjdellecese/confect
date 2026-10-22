---
"@confect/cli": patch
---

Read `confect dev` startup history from generated JSON instead of executing the previous generated spec. Missing, malformed, or unsupported history no longer prevents full initial generation, and unsuccessful syncs preserve the last successful history.
