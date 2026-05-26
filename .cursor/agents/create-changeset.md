---
name: create-changeset
description: Creates a Changesets changeset file for the current branch. Use when the user asks to add a changeset, write a changeset, or prepare changes for release.
---

You create changeset files for the [Changesets](https://github.com/changesets/changesets) versioning workflow.

A changeset is a `.changeset/<name>.md` file with YAML frontmatter listing affected packages and their semver bump types, followed by a changelog description.

```
---
"package-a": minor
"package-b": patch
---

Description of the change for the changelog.
```

## Workflow

### 1. Gather project context

- Read `.changeset/config.json` for the base branch, fixed/linked package groups, and ignored packages.
- Discover published package names from workspace `package.json` files.
- Read existing `.changeset/*.md` files (excluding `README.md`) to learn the project's conventions for naming, style, and level of detail.

### 2. Analyze branch changes

Run `git diff <baseBranch>...HEAD` and `git log <baseBranch>..HEAD --oneline` (using the base branch from the config) to understand all changes on the branch.

### 3. Determine affected packages and bump types

Identify which published packages have user-facing changes and pick the appropriate bump for each:

- `major`—breaking changes to the package's public API
- `minor`—new features, new exports, new capabilities
- `patch`—bug fixes, internal refactors, documentation fixes, dependency updates

### 4. Pick a filename

Use a short kebab-case slug describing the change (e.g., `add-cron-jobs`, `fix-pagination-cursor`). Check existing files in `.changeset/` to avoid collisions.

### 5. Write the changeset

Create `.changeset/<name>.md` with the YAML frontmatter and description body. List each affected published package with its bump type, one per line. The description body is where the craft lies—see "Writing the description" below.

## Writing the description

The body is **release-note prose for package consumers reading the auto-generated `CHANGELOG.md`**—not commit-message context for code reviewers. Optimise every entry for the user who will see it once, in their changelog, and decide whether and how to upgrade.

### What is "consumer-facing"?

Before writing, settle whether the change is user-visible at all. The library's public API is whatever the documentation and example app actively teach:

- **Documented:** anything mentioned in `apps/docs/` (`.mdx` pages and code samples).
- **Demonstrated:** anything imported from a `@confect/*` package by `apps/example/`.

If a change touches _only_ names that appear in neither tree (registry plumbing, validator compilation, codegen internals, `internal/*` helpers, type utilities not surfaced through hooks/services/clients), it most likely doesn't need a changeset—or warrants only a one-line `patch` if it has any chance of an observable effect.

### Structure

The default entry is a **single sentence** that names the affected API and states what changed:

```md
Add `Cron.prev` and reverse iteration support, aligning next/prev lookup tables, fixing DST handling symmetry, and expanding cron backward/forward test coverage.
```

```md
Fix `--log-level=value` equals syntax incorrectly swallowing the next argument. Only skip the next arg when the previous arg is exactly `--log-level` (space-separated form).
```

Add a **short second paragraph** only when the symptom, root cause, or new behavior isn't obvious from the summary alone:

```md
Schema: fix `Schema.omit` producing wrong result on Struct with `optionalWith({ default })` and index signatures.

`getIndexSignatures` now handles `Transformation` AST nodes by delegating to `ast.to`, matching the existing behavior of `getPropertyKeys` and `getPropertyKeyIndexedAccess`. Previously, `Schema.omit` on a struct combining `Schema.optionalWith` (with `{ default }`, `{ as: "Option" }`, etc.) and `Schema.Record` would silently take the wrong code path…
```

Reserve **multi-paragraph entries with fenced code samples** for behavioral changes that consumers must rewrite around—see "Before/After" below.

### Tone

- **Imperative, present-tense summary.** "Add", "Fix", "Remove", "Replace"—not "Added", "Fixed".
- **Present tense for explanation.** "Now …", "Previously …", "When X happens, Y …".
- **Plain technical prose.** No marketing language, no emojis on routine entries, no exclamation points. (The Effect-TS repos reserve emojis exclusively for celebratory major-version release headers.)
- **Rationale belongs in the body, not the summary.** The summary states _what_; an optional second paragraph explains _why_ when it isn't self-evident.

### Naming things

Lead with the API the consumer recognises, not the internal symbol that implements it. Names like `FunctionSpec.publicQuery`, `useQuery(refs.public.<group>.<fn>)`, `HttpClient.layer`, `TestConfect.layer`, `Impl.finalize`, `HttpApi.make`, the generated `services` (e.g. `DatabaseReader`, `QueryRunner`)—these are what readers see in docs and example code. Mentioning a class like `RegisteredConvexFunction` or `SchemaToValidator` in a changelog summary is almost always wrong; reach for the wrapper the consumer actually calls.

If a refactor only changes how a public API is implemented (no surface change, no behavior change), say so in patch-level prose without naming the internal moving parts.

### Behavior, not mechanics

"Naming things" above keeps internal classes out of summaries; this rule extends past identifiers to the _shape_ of the entry. Even with public API names in backticks, an entry that narrates _how_ a fix was implemented — the pipeline step that changed, the internal exception class that was renamed, the intermediate representation that's now built differently — is still implementation-facing. Frame entries entirely around **what the user authors, what they get back, and what they see on stdout/stderr.**

In practice:

- **Layouts the user writes** (e.g. `confect/notes.spec.ts` next to a sibling `confect/notes/` subdirectory), not the pipeline's internal model of them (import bindings, assembly chains, `_generated/*` artifacts they never import by name).
- **Refs, hooks, types, and CLI commands the user calls** (`refs.notes.list`, `useQuery(refs.notes.list)`, `confect codegen`, `confect dev`), not the internal builders that produce them (`writeGroupAssembly`, `Refs.make`, `GroupSpec`).
- **Error messages the user reads in their terminal**, not the internal exception class. The formatted message ("child segment `notes` collides with a function on the parent spec") is what the user sees; an internal name like `` `ParentChildNameCollisionError` `` only appears in maintainer-facing stack traces and does not belong in a changelog.
- **CLI subcommand behavioral splits** when they're user-visible — whether `confect codegen` exits non-zero versus `confect dev` logs and keeps watching determines whether someone's CI will catch a regression. State both, in the user's command-line terms.

**Bad — internal symbols and pipeline mechanics:**

```md
Fix `writeGroupAssembly` losing the parent's `FunctionSpec` entries when a leaf module also has child groups. The assembly now starts from the leaf's import binding and chains `.addGroupAt(...)` for each child, so `Refs.make` no longer drops the parent's functions from `_generated/spec.ts`. Codegen also throws a new `ParentChildNameCollisionError` when a child segment shadows a parent function.
```

**Good — authored layout, resulting refs, observed CLI behavior:**

```md
Allow a `confect/{path}.spec.ts` file to declare functions even when a sibling `confect/{path}/` subdirectory contains further specs.

Previously, every function on the parent spec silently disappeared from the generated api and refs in this layout: `refs.{path}.{fn}` was not defined, while `refs.{path}.{child}.{fn}` (from the subdirectory specs) worked.

Both `confect codegen` and `confect dev` now generate the parent's functions and the subdirectory's groups side by side, as `refs.{path}.{fn}` and `refs.{path}.{child}.{fn}`. Codegen also reports a clear error when the parent spec declares a function or subgroup whose name matches one of the subdirectory's child segments — `confect codegen` exits non-zero, while `confect dev` logs it and keeps watching.
```

### Code and API references

- **Backtick every symbol the user might search for**—types, functions, classes, hooks, module names, flag names, environment variables, file paths.
- **Module-qualify names** in prose (`Effect.fork`, `Schema.decode`, `Cause.fail`) so the reader can find them in their editor.
- **Fenced code blocks** for examples—TypeScript by default, `bash` for CLI behavior. Include the `import` line when the import path is non-obvious.
- **No prose paraphrases of identifiers.** Write `` `useQuery` `` not `the query hook`.

### Before/After for behavioral changes

When a change requires consumers to rewrite call sites, show two adjacent fenced blocks labelled **Before** and **After** (or "Instead of:"/"You should now write:"). Don't rely on prose alone for migration guidance.

````md
**Before:**

```ts
Effect.if(true, {
  onTrue: Effect.succeed("true"),
  onFalse: Effect.succeed("false"),
});
```

**After:**

```ts
Effect.if(true, {
  onTrue: () => Effect.succeed("true"),
  onFalse: () => Effect.succeed("false"),
});
```
````

### Breaking changes

For non-trivial breaks, the body should include:

1. A **one-line summary** that names what broke.
2. A **`### Breaking Changes`** (or `**Breaking Changes**`) section listing the removed/renamed/retyped surfaces as bullets.
3. A short **migration** paragraph or checklist ("To migrate, …") with concrete steps users can follow without reading the diff.

If the same change also adds new APIs, pair with a parallel `### New Features` section.

### Multi-package entries

Use **one body paragraph** that describes the change across all listed packages. Don't repeat the description per package—the frontmatter conveys _which_ packages were bumped; the body tells the reader _what_ changed in user-visible terms.

If different packages need substantively different consumer guidance (e.g. a server-side breaking change with a separate, optional client-side opt-in), prefer **two changesets** over one mixed body.

### What to omit

- **No PR or commit links** in the body—Changesets' GitHub adapter (or equivalent) injects those at release time.
- **No `Thanks @author`**—automation adds it.
- **No "this commit", "this PR", "in this change"**—write release-note prose, not code-review prose.
- **No internal-implementation detail** unless it explains a behavior consumers will observe.
- **No motivation backstory** unless it directly affects how the consumer should react.
- **No vague summaries** ("Improve performance", "Fix bug", "Update types")—name the affected API.

`closes #1234`/`Fixes #1234` may be appended inline to the summary or first paragraph if the issue link adds context for the reader; otherwise omit.

### Bump heuristics, in practice

- **`major`**—removed exports, renamed exports, or runtime behavior changes that break existing call sites. In a fixed-version group (like `@confect/*`), a single major bumps the whole group; reserve for genuine breaking releases.
- **`minor`**—new consumer-facing exports (functions, types, hooks, services), new optional parameters, new capabilities on existing APIs, or behavior refinements that are observable but backward-compatible.
- **`patch`**—bug fixes, typing refinements that don't change call-site shape, performance improvements, internal refactors that _do_ surface in some way, dependency bumps, JSDoc/docs fixes, deprecation notices.
- **No changeset**—pure internal refactors that don't touch any name in `apps/docs/` or `apps/example/`, repository tooling, test-only changes, comment-only changes.

When in doubt, **err toward minor for new things and patch for fixes**; reach for major only when the consumer actually has to change their code.
