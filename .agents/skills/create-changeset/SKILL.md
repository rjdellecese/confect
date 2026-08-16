---
name: create-changeset
description: >-
  Write a Changesets changeset file for the current branch. Use when the user
  asks to add a changeset, write a changeset, or prepare changes for release,
  and before opening a PR that changes published @confect/* code.
---

# Creating changesets

A changeset is a `.changeset/<name>.md` file: YAML frontmatter listing affected packages with semver bump types, then a changelog entry.

```md
---
"@confect/react": minor
---

Description of the change for the changelog.
```

The entry is **release-note prose for consumers reading `CHANGELOG.md`** — people who use the published packages through the documented API and have never read Confect's source. The one rule everything below serves: **describe the change to the package's public surface as a consumer experiences it; never summarize the diff.**

You will usually have just made the change yourself. Write from your knowledge of the intent and the user-facing outcome. Use the diff only to confirm which published packages changed and to catch surface changes you forgot — not as source material for prose.

> **Do not imitate existing changesets or CHANGELOG entries.** Many past entries over-describe implementation and name internal symbols; they are precedent for file format only, not for style or level of detail. Read `.changeset/` only to avoid filename collisions.

## 1. List the user-visible delta

Before writing any prose, list what changed on the public surface. Only four kinds of things belong on this list:

1. **Exports consumers call** — functions, hooks, services, classes, types they write in their own code (`useQuery`, `FunctionSpec.publicQuery`, `TestConfect.layer`).
2. **Observable behavior** — results, type errors at consumer call sites, runtime errors and their messages, what `confect codegen` / `confect dev` print and their exit codes.
3. **Authored artifacts** — file layouts the user writes (`confect/notes.spec.ts`), generated names they reference (`refs.notes.list`).
4. **Dependency and peer range changes** on published packages.

Diff hunks that change nothing on this list — internal helpers, type plumbing, codegen pipeline steps, test files — do not appear in the changeset at all, not even as an aside.

- **Empty list, no published package behavior touched** → no changeset (internal refactors, tests, tooling, comments).
- **Empty list, but published code changed in a way that could conceivably surface** → one-sentence `patch` stating the observable risk area, without naming internals.

## 2. The public-surface test

Confect's public API is what the documentation and example app teach. Every identifier you intend to name in the entry must pass one of:

- **Documented**: appears in `apps/docs/**/*.mdx`
- **Demonstrated**: used via a `@confect/*` import in `apps/example/`
- **New in this branch**: added by this change, exported from the package's public entry point, and something a consumer will type in their own code

Names that are consumer-observable by nature also pass without a grep hit: npm package names in dependency/peer range changes, web-platform globals, and fields of the published `package.json` (e.g. `sideEffects`, `exports`).

Verify — don't assume:

```bash
grep -rn "TheName" apps/docs --include="*.mdx"
grep -rn "TheName" apps/example/src apps/example/confect
```

A name that fails the test doesn't get prose about it — it gets **replaced by the consumer-facing wrapper it serves**, or the sentence is cut. If you cannot state the change without naming an internal symbol, that's strong evidence the change isn't user-facing; drop to a one-line `patch` or no changeset.

The same test applies to _mechanics_, not just identifiers: a sentence narrating how the fix works internally (what now decodes what, which step of the pipeline changed, what was renamed) is implementation-facing even if every noun is public. Frame every sentence around what the consumer authors, calls, gets back, or sees in their terminal.

## 3. Frontmatter and bump

Read `.changeset/config.json` for `baseBranch` and the fixed group. All `@confect/*` packages version together, so the frontmatter's job is accuracy, not storytelling: list each published package whose _own surface or behavior_ changed. Don't add a package just because it contains supporting plumbing for another package's feature.

- **`major`** — removed/renamed exports or behavior changes that break existing consumer code. One major bumps the whole fixed group; reserve for genuine breaks.
- **`minor`** — new consumer-facing exports, new optional parameters, new capabilities, backward-compatible observable refinements, raised peer-dependency floors (consumers must upgrade the peer alongside).
- **`patch`** — bug fixes, typing fixes that don't change call-site shape, performance, dependency bumps requiring no consumer action, docs/JSDoc fixes.

When in doubt: minor for new things, patch for fixes; major only when consumers must change their code.

Name the file with a short kebab-case slug describing the change (`add-use-paginated-query`, `fix-pagination-cursor`).

## 4. Write the entry

**Default shape: one sentence** naming the affected API and what changed. Add a short second paragraph only when the symptom or new behavior isn't obvious from the summary. Reserve multi-paragraph entries with code blocks for new APIs worth a usage sample and for breaking changes.

- Imperative, present-tense summary: "Add", "Fix", "Remove" — not "Added", "Fixed".
- "Now …" / "Previously …" for behavior explanation. Plain technical prose; no marketing, no emojis.
- Backtick every symbol, flag, path, and command a reader might search for; module-qualify names (`Schema.decode`, `Cron.prev`).
- For runtime errors, quote (or closely paraphrase) the message the user sees — never the internal error class name.
- New API worth adopting → a short fenced usage example, with the `import` line if non-obvious.
- Consumers must rewrite call sites → adjacent **Before:** / **After:** fenced blocks.
- Non-trivial breaking change → one-line summary, a `### Breaking Changes` bullet list of removed/renamed/retyped surfaces, and a short "To migrate, …" paragraph usable without reading the diff.
- One body across all listed packages — the frontmatter already says which packages moved. If server and client consumers need substantively different guidance, write two changesets.

Omit: PR/commit links and `Thanks @…` (automation adds them); "this PR"/"this commit" phrasing; motivation backstory; vague summaries ("Improve performance", "Update types"); history of prior workarounds — describe where the consumer lands, not the journey.

### Example

A real PR added a `usePaginatedQuery` hook to `@confect/react`, supported by new decoding helpers and ref types in `@confect/core`.

**Bad — narrates the supporting plumbing, shows no usage:**

```md
Add typed paginated query support to `@confect/react` with `usePaginatedQuery`, including typed paginated args, result items, and pagination options. Add supporting pagination page decoding and public paginated query reference types to `@confect/core`.
```

The second sentence fails the public-surface test: consumers never import the decoding helper or the reference types; they exist to make the hook work. "Typed paginated args, result items, and pagination options" describes the types' existence instead of what anyone writes.

**Good — the hook as the consumer uses it:**

````md
Add `usePaginatedQuery` to `@confect/react` — a typed wrapper around Convex's paginated queries that accepts a Confect query ref and decodes each page of results through the query's returns schema.

```ts
import { usePaginatedQuery } from "@confect/react";

const { results, status, loadMore } = usePaginatedQuery(
  refs.public.notes.list,
  { author },
  { initialNumItems: 10 },
);
```
````

## 5. Final check

Reread the entry as a consumer who knows the docs but has never seen Confect's source, and confirm:

1. Every backticked identifier passes the public-surface test of section 2.
2. No sentence explains how the change was implemented — only what the consumer authors, calls, receives, or sees.
3. The frontmatter lists only packages whose own surface or behavior changed.
4. The summary alone tells a reader whether the release affects them.

If any check fails, fix the entry before saving — don't ship it with a caveat.
