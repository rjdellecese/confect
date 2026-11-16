# API reference scope

This manifest tells reference authors which Confect contracts the codebase
documentation teaches. It is documentation metadata, **not an export allowlist**
or a promise that an omitted API is unused, unsupported, or safe to remove.

The baseline is main at `fa11e5750c79d5a729cec1b37684b0927ed48699`, including the
storage-context, client-service and deployment-schema corrections in #925,
#927 and #928. It is not the live documentation release. CronWindow, Foldkit
QueryResult and React optimistic updates are included. Upstream Effect schema
terminology is being revised separately; that does not add Confect exports.

## Read the manifest

The five JSON files form one manifest: `core.json`, `server.json`,
`database.json`, `clients.json` and `generated.json`. The split follows API
families, not package publication boundaries. `validate.ts` defines their shape.

Each module key identifies a package import path. A root namespace import and
its subpath share one classification; for example, `Table` from `@confect/core`
and `@confect/core/Table` refer to the same owner. `source` locates that owner.
Entries group only symbols with the same decision and evidence. Expand each
`symbols` array into individual `(module, symbol)` keys when consuming it.

| Field                   | Meaning                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference: included`   | Write a reference entry for exactly this symbol or contract, retaining its note and qualifier.                                                |
| `reference: supporting` | Keep it available when rendering signatures or explaining a generated dependency; no independent reference entry is requested.                |
| `reference: omitted`    | No standalone entry in this pass. An explicit undecided entry is a candidate for a later documentation decision.                              |
| `audience`              | Intended use: `application`, `generated-code`, `compatibility`, `implementation`, or `undecided`. This is independent of reference inclusion. |
| `evidence`              | A checked-in path and literal quote that support the decision. Source-only evidence explains dependencies or candidates, not new inclusion.   |
| `source` on an entry    | Definition owner for a re-export or inherited contract; keep the public module key as its reference identity.                                 |
| `qualifier`             | `experimental` remains visible in reference output; it does not mean internal.                                                                |

Dotted symbol paths locate **contracts**, not necessarily JavaScript property
access expressions. They can identify returned builder members, acquired
service operations, callback fields or constructor options. For example,
`Auth.getUserIdentity` is the Effect property on the acquired service, not a
static call on the tag; `daily.options.hourUtc` identifies an input field.
Notes distinguish these forms and upstream-owned nested shapes. Including a
container never includes all its members or constructors: `QueryStream` does
not promote `new QueryStream`, and an included local-store type does not
silently promote every adapter/helper.

`kind: generated` keys identify application-generated module patterns, not
package exports. Their source files are representative checked-in generated
artifacts or templates. Concrete table/group names vary by application; notes
record the naming and returned-shape contracts. `kind: command` describes the
`@confect/cli` executable. Its source exports are not importable library APIs.

Unlisted symbols default to **omitted / undecided**, not internal. Unlisted
members remain unlisted even when their containing type is included. This is a
bounded reference scope, not an exhaustive census of every accessible export.

## Preserve the compatibility boundary

Generated server service tags are the application service entry points. Raw
package tags, specialization factories and invocation layers remain accessible
dependencies, not manually promoted entry points. Explicitly taught JS/Foldkit
layers, TestConfect construction, logger/configuration helpers and AI layers are
separate authoring APIs and remain included where taught.

Named failures already taught by the docs receive entries even without an import
example. Untaught compiler errors, additional QueryStream errors, Foldkit's
`prev`, and unnamed optimistic-store methods are recorded as candidates, not
silently added. Semantic teaching counts: database callback operations are
captured on their owning method, while upstream Convex callback types keep
upstream ownership. The optimistic guide teaches decoded refs/values but does
not specify the three store methods individually; those remain explicit
undecided candidates rather than internal APIs.

QueryStream support modules have no standalone reference pages. Their concepts
and necessary type shapes belong under QueryStream. This does not suppress
public aliases: preserve each alias under its public module key, even when its
definition lives in a hidden support file. The same rule applies to AI gateway
failure re-exports from `internal/`. Reference inclusion of an alias depends on
documented scope, not its physical source path.

`confect/_generated/convexSchema` is a deployment/test contract. Test setup
legitimately needs it and the runtime schema. Keep eager application deployment
validator construction out of function runtime import graphs; do not turn this
boundary into a universal import prohibition.

**Keep the full declaration dependency graph.** The explicit supporting entries
are examples of required owners, not an exhaustive type closure. A later
renderer must resolve all types reachable from an included signature, including
unlisted/omitted types and internal relative imports, and display them inline
or under their public owner without promoting independent pages. Keep upstream
types linked to their owners. Do not filter package emission, export maps or
declarations using this manifest; do not add `@internal` or `stripInternal`.
External usage remains unknown.

## Validate and maintain

Run from the repository root with the installed project dependencies:

```sh
bun tools/api-docs/validate.ts
bun test ./scripts/apiDocsScope.test.ts
pnpm oxfmt --write tools/api-docs/*.json tools/api-docs/*.ts tools/api-docs/README.md
pnpm oxlint --fix tools/api-docs/*.ts
```

Validation checks the metadata shape, module/source ownership, duplicate
classifications, safe source paths, source identifier tokens, public alias or
inherited-owner presence, and literal evidence. Included entries require docs
evidence. The pure validator returns tagged problems; the command reads files
and reports failures without importing library source or evaluating schemas.
Its regression tests also validate the checked-in manifest and run in the
existing `bun test ./scripts` lane (part of `pnpm test`). Format and lint
`scripts/apiDocsScope.test.ts` too when changing the tests.

This is a **lexical integrity check, not a TypeScript resolver**: it does not
prove member containment, overload coverage, semantic completeness, alias
identity or a renderable type closure. Review changed decisions against the
source and docs, not just a green check. Literal evidence avoids fragile line
numbers but must be updated deliberately when wording changes. A future
extractor must prove alias/type-closure rendering before publication; no
extractor, navigation generator or deployment is installed here.

When adding a contract, select its actual public owner and exact member scope,
record the smallest useful quote, and decide reference inclusion separately
from audience. Preserve uncertain source-only discoveries as candidates.
For metadata-only changes, confirm the diff contains only `tools/api-docs/`
and its `scripts/apiDocsScope.test.ts` test, and run `git diff --check`; no
package build is implied by these checks.

This records the approved docs-only classification from RJS-70, based on the
documented-symbol inventory (RJS-61) and export compatibility audit (RJS-68).
The checked-in evidence and decisions above are sufficient to maintain it
without access to those research handoffs. Later work should consume the exact
included keys plus signature support, not rescan all exports into reference
navigation.
