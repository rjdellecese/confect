---
"@confect/cli": patch
---

Fix `confect codegen` when `convex/convex.config.ts` imports generated refs on a clean project.

Keep generated output working when its directory is on a different Windows drive from the project.
