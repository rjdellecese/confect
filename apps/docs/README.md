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

Guides and API Reference have separate top-level Mintlify tabs and sidebars.
Module pages group types and values by their source `@category` tags, rather
than by declaration kind. New category names work without a site-side registry;
untagged declarations use `Other`. Each module has a category-first index of
exports and their directly declared callable APIs. Methods and service operations
use owner-qualified names, such as `ActionRunner.runAction` under Invocation.
FunctionSpec shows `functionSpec.middleware()` under Combinators on the returned
spec rather than indexing the `Builder` interface separately. Its real type
name stays in signatures, and existing links still resolve. Inherited methods
are not repeated as index entries on derived types. Data properties, inherited members, parameters,
returns, and signature details stay in the owning entry's body.
Each indexed operation is rendered once; its owner links to that canonical
section instead of duplicating its documentation and anchor.
Category titles capitalize their first letter without changing acronyms such
as HTTP. Native Mintlify badges distinguish types, functions, and values in the
body without lengthening navigation labels. Same-name type/value exports keep a
short kind suffix so their native outline entries remain distinguishable.
Merged type namespaces stay on their owning page
instead of creating duplicate sidebar entries.

Generation and formatting always happen in a temporary directory before copying
the result to ignored `api/reference/`, so preview and release output match.
Commit navigation changes in
`docs.json`, not the rendered pages. Edit package JSDoc for extracted contracts;
edit `api/generated.mdx` for generic codegen helpers, checking its claims against
`packages/cli/src/templates.ts`. Do not document an example app's function or
table names as universal APIs.

The small theme adapter supplies Mintlify frontmatter/routes and asks the
Markdown plugin to render the existing members inside Effect `Service` type
arguments and class-based service contracts. A conversion hook fills missing
categories on re-exports from their local export statement's standard JSDoc;
it preserves upstream descriptions and more-specific categories. It escapes
prose without changing code examples and uses span IDs
instead of empty links for accessible anchors. TypeDoc's `api-` anchor prefix
keeps cross-reference targets distinct from Mintlify's heading IDs.
A page-local view groups the existing TypeDoc reflections without changing
their names, parents, signatures, or source categories. The Markdown plugin
still renders each entry's contract. A standard Markdown parser formats body
detail headings as labels, leaving only categories and indexed APIs in the
native outline. Fenced examples, tables, and links are
left intact. No custom navigation component, CSS selectors, DOM scripts, or
unsupported table-of-contents settings are needed. Effect's custom kind icons
in its outline are not reproduced; Mintlify retains its native navigation.
All signatures, overloads, comments, and error aliases still come
from TypeDoc; no symbol manifest or custom signature renderer is maintained.
Internal support types can remain named in public signatures without getting
their own pages. Inline dependency-owned option fields are retained; only
inherited dependency members are omitted (constructors remain). This avoids
turning an expanded Convex options type into an empty object while keeping
upstream schema machinery out of Confect's pages.
TypeDoc currently reports non-fatal comment warnings for
inferred overload parameters and links to excluded/internal or upstream types;
those links render as plain text. Broken site links remain CI failures.

`docs:api:check` checks navigation, public/internal coverage, source provenance,
all generated links/anchors, and byte-for-byte repeatability. The docs workflow
also generates the reference before Mintlify validation, link checks, and
accessibility checks. Run those locally with `pnpm --filter docs exec mintlify
validate` and `pnpm --filter docs exec mintlify broken-links` after generation.

## Publication

### Pull request previews

For pull requests from branches in this repository, CI compares the rendered
docs with the PR's merge base. A change to a guide, navigation, asset, or
generated API page can trigger a preview. A different source commit SHA alone
does not. The docs workspace's README, changelog, and package manifest are not
part of the preview. If the docs change, CI writes the validated snapshot to
`preview/pr-<number>` and posts the Mintlify review link on the PR. Later
changes update the same preview. Fork and Dependabot PRs do not publish.
Closing a PR does not delete its snapshot branch. To retire the preview,
delete that PR's `preview/pr-<number>` branch.

**One-time setup** (repository administrator):

1. Connect the Mintlify GitHub App to this repository. The Mintlify plan must
   include [preview deployments](https://www.mintlify.com/docs/deploy/preview-deployments)
   and [preview API access](https://www.mintlify.com/docs/api/preview/trigger).
   Previews are public by default; configure preview authentication in Mintlify
   first if unpublished material must be private.
2. In GitHub **Settings → Environments**, create `mintlify-preview`. Under
   deployment branches and tags, allow only the `main` branch (no tag or PR
   patterns). Add `MINTLIFY_API_KEY` as an **environment secret**, using a
   Mintlify admin key with write access. Do not put the key in repository-wide
   secrets or in the PR build.
3. After both preview workflows have landed on `main`, set the **repository
   Actions variable** `MINTLIFY_PROJECT_ID` to the project ID. Setting it
   enables previews on subsequent PR opens and updates; unsetting it disables
   them. The trusted publisher is a `workflow_run` workflow and does not run
   from a feature branch.

The PR build has read-only repository access and no publishing key. The
publisher uses the workflow and script from the default branch; it reads the
rendered files as data and never runs PR code. Preview publication does not
push to the PR branch, `main`, or `release`.

### Production

Use the existing Docs Release workflow and `release-docs` skill. No package
publication is required. Deployment checks out the requested main commit before
installing its frozen dependencies, generates into the staged docs snapshot,
and validates it before an ordinary push to `release:apps/docs`. The reference's
source page and source links record that selected SHA and package versions.
Local previews reflect the working tree, so commit source edits before treating
their revision links as immutable evidence. Generation alone never deploys.
