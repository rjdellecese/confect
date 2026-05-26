---
"@confect/cli": patch
---

Allow a `confect/{path}.spec.ts` file to declare functions even when a sibling `confect/{path}/` subdirectory contains further specs.

Previously, every function on the parent spec silently disappeared from the generated api and refs in this layout: `refs.{path}.{fn}` was not defined, while `refs.{path}.{child}.{fn}` (from the subdirectory specs) worked. The parent's `*.impl.ts` continued to type-check on its own, so the missing functions only showed up when something tried to call them.

Both `confect codegen` and `confect dev` now generate the parent's functions and the subdirectory's groups side by side, as `refs.{path}.{fn}` and `refs.{path}.{child}.{fn}`.

Codegen also now reports a clear error when the parent spec declares a function or subgroup whose name matches one of the subdirectory's child segments, rather than letting the conflict turn into a runtime refs collision. `confect codegen` exits non-zero on this error; `confect dev` logs it and keeps watching so the next save can recover.
