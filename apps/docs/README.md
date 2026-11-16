# Confect Documentation

The Confect documentation site, powered by [Mintlify](https://mintlify.com).

## API reference

From the repository root:

```sh
pnpm docs:api
pnpm docs:api:check
pnpm dev:docs
```

`docs:api` reads the six library entrypoints and their source JSDoc with pinned
TypeDoc and `typedoc-plugin-markdown`. It honors `@internal`, retains public
re-exports, and never evaluates application modules. The lockfile resolves
TypeScript 5.9.3 for TypeDoc's compiler API; build/typecheck still uses `tsrs`.
`tsconfig.docs.json` resolves workspace imports to source, not stale `dist` or
installed releases. The CLI is a binary, not a package API reference.

Generated MDX lives in ignored `api/reference/`. Commit navigation changes in
`docs.json`, not the rendered pages. Edit package JSDoc for extracted contracts;
edit `api/generated.mdx` for generic codegen helpers, checking its claims against
`packages/cli/src/templates.ts`. Do not document an example app's function or
table names as universal APIs.

The small theme adapter supplies Mintlify frontmatter/routes and asks the
Markdown plugin to render the existing members inside Effect `Service` type
arguments. It uses span IDs instead of empty links for accessible anchors.
All signatures, overloads, comments, and error aliases still come
from TypeDoc; no symbol manifest or custom signature renderer is maintained.
Internal support types can remain named in public signatures without getting
their own pages. TypeDoc currently reports non-fatal comment warnings for
inferred overload parameters and links to excluded/internal or upstream types;
those links render as plain text. Broken site links remain CI failures.

`docs:api:check` checks navigation, public/internal coverage, source provenance,
all generated links/anchors, and byte-for-byte repeatability. The docs workflow
also generates the reference before Mintlify validation, link checks, and
accessibility checks. Run those locally with `pnpm --filter docs exec mintlify
validate` and `pnpm --filter docs exec mintlify broken-links` after generation.

## Publication

Use the existing Docs Release workflow and `release-docs` skill. No package
publication is required. Deployment checks out the requested main commit before
installing its frozen dependencies, generates into the staged docs snapshot,
and validates it before an ordinary push to `release:apps/docs`. The reference's
source page and source links record that selected SHA and package versions.
Local previews reflect the working tree, so commit source edits before treating
their revision links as immutable evidence. Generation alone never deploys.
