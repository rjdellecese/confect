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

Distinguish the API an application uses from exports that codegen needs to
construct, type, or document it. Check the generator, emitted files, handwritten
call sites, and migration guides before classifying an export. For a support-only
declaration, use `@internal` and add a short hover note explaining its role and
which generated import or member to use instead. Keep the TypeScript export and
signature. If the declaration owns public operations, keep those operations
visible: use a `@remarks` note starting with `Codegen support:` on the owner
rather than hiding it and its members.

Check public JSDoc for references to the support declaration, including prose,
links, examples, and parameter and return descriptions. Check package barrels,
subpaths, and comments emitted by the CLI as well as the declaration's module.
Describe the public receiver or import instead. Verify the extracted package and
generated references: the support-only entry should be absent, but generated
tags, types, and callable members must remain usable. A required TypeScript type
reference or a link to a public method is not a recommendation to import its
owner.

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
