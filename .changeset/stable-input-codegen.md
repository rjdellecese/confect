---
"@confect/cli": patch
---

Speed up one-shot `confect codegen` on stable inputs.

Run codegen after source edits, configuration changes, and dependency installation have settled. If inputs change during generation, rerun it: detected changes may fail or retry, but recovery from every concurrent change is not guaranteed. `confect dev` keeps its existing change handling.
