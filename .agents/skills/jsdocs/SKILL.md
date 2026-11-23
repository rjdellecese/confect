---
name: jsdocs
description: Public API JSDoc. Use when authoring or reviewing Confect API documentation, refining a module's documentation, or fixing documentation related diagnostics.
---

## Workflow

1. Inspect the declaration, implementation, nearby JSDoc, tests, and call sites.
2. Select every applicable branch and load its reference before editing:
   - tags, modules, or links: [declarations.md](declarations.md);
   - categories: [categories.md](categories.md);
   - examples: [examples.md](examples.md).
3. Make a focused API fix or module refinement. Preserve verified facts and
   valuable examples rather than rewriting mechanically.
4. For module refinement or APIs with close alternatives, audit `@see` links
   and inspect implementation and tests for concrete `**Gotchas**`.
5. Run `pnpm build && pnpm check:examples` and every applicable root validation
   command. The example check typechecks TypeScript; it does not check prose or
   execute examples.

`@internal` declarations and default exports are outside public JSDoc
authoring, except for public generated default exports.

Public declarations use a multiline block with one self-contained practical
description paragraph. Start functions and methods with a present-tense action;
match nearby noun-family phrasing for values. Optional non-empty sections appear
once in this order: `**When to use**`, `**Details**`, `**Gotchas**`. Separate
descriptions, sections, examples, and tags with one blank line. `**When to
use**` states a positive use case distinct from the description; reserve
`**Gotchas**` for concrete caveats and failure modes.

The task is complete when every changed public declaration satisfies each
applicable reference, the examples typecheck, and all other applicable root
checks pass or are reported as not run.
