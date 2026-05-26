---
"@confect/cli": patch
---

Generate a unique import binding per spec leaf in `_generated/spec.ts`, even when sibling `*.spec.ts` files share a basename across directories.

Previously, codegen keyed import bindings by file basename (the filename minus `.spec.ts`). When two leaves shared a basename they collapsed to a single binding, last write wins. Every `addGroupAt(...)` site that should have referenced any of the colliding leaves ended up referencing the same survivor, and every impl whose sibling spec was dropped failed `validateImpl` with `Could not resolve group path for the provided GroupSpec.` because the assembled tree no longer contained that spec object's identity.

Each binding now carries its own `localName` derived from the leaf's full path segments (e.g. `scripts_operational_seed_mutations`), used both as the imported identifier and at the matching `addGroupAt` site. Top-level leaves with single-segment paths are unchanged (`env`, `notes`, etc.).
