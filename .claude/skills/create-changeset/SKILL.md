---
name: create-changeset
description: >-
  Write a Changesets changeset for the current branch as release-note prose for
  package consumers — naming only the public API, CLI behavior, and generated
  files they can actually observe, never internal or `internal/*` symbols. Use
  this skill whenever adding or revising a changeset, preparing a branch for
  release, or deciding whether a change warrants one at all — including when the
  user doesn't explicitly ask for changeset help. Also use when asked about
  changeset conventions or bump types.
---

# Creating a changeset

You write changeset files for the [Changesets](https://github.com/changesets/changesets) versioning workflow.

A changeset is a `.changeset/<name>.md` file with YAML frontmatter listing affected packages and their semver bump types, followed by a changelog description.

```
---
"package-a": minor
"package-b": patch
---

Description of the change for the changelog.
```

## The rule everything else serves

**A changeset is not a summary of the diff.** It is release-note prose for a package consumer who will read it once, in their `CHANGELOG.md`, and decide whether and how to upgrade. That reader has never seen your branch, cannot see your source tree, and only ever interacts with the package through its published API, its CLI, and the files it generates.

The diff is _evidence_ you consult to answer consumer questions. It is not the subject. Every failure mode this document guards against — naming internal classes, narrating pipeline steps, describing refactors nobody can observe — comes from writing the diff up rather than writing the consumer's experience down.

## Workflow

### 1. Gather project context

- Read `.changeset/config.json` for the base branch, fixed/linked package groups, and ignored packages.
- Read existing `.changeset/*.md` files (excluding `README.md`), and the top ~100 lines of the affected packages' `CHANGELOG.md`, to match the project's established voice and level of detail.

### 2. Establish the public surface of each affected package

Do this **before** reading the diff closely, so you know what to look for.

For each package with changes, read its `package.json` `exports` map. Then classify every name you might mention into one of three tiers:

**Tier 1 — name freely.** Appears in `apps/docs/**/*.mdx`, or is imported/called by `apps/example/`. This is the API the project actively teaches; it is what the reader recognizes.

**Tier 2 — name only if ordinary application code calls it directly.** Reachable through the package's `exports` map (the `.` root or a `./*` subpath) but absent from docs and the example app. Being exported is necessary but _not_ sufficient: `@confect/core` exports every top-level module through `./*`, including plumbing like `Registry`, `Types`, `RuntimeAndFunctionType`, `Lazy`, and `FunctionProvenance`.

The test is **not** "could some consumer write this name" — that is answerable as yes for every export, and it is how supporting types creep back into entries. The test is whether someone using the feature the normal way types that identifier. A constraint or derivation helper that exists to type the primary API — the `Any*` interface it is generic over, the `*Args`/`*Item`/`*Options` aliases derived from it — fails that test: it is written only by someone building a generic wrapper _over_ Confect, which is not the reader you are writing for. Name the primary API; leave its supporting type surface to the docs and to autocomplete.

**Tier 3 — never name.** Specifically:

- Anything under an `./internal/*` subpath (`@confect/core`, `@confect/server`, and `@confect/test` all export one). Exported for cross-package use, not for consumers. This is the single most common leak.
- Anything not reachable through the `exports` map at all.
- **Every symbol in `packages/cli/src/`.** `@confect/cli` exports only `./package.json` — it ships a binary and nothing else. Its entire consumer surface is the behavior of `confect codegen` and `confect dev`, the files written under `confect/_generated/`, and what appears on the terminal. `Bundler`, `SpecAssemblyNode`, `LeafModule`, `CodegenError`, `ConfectDirectory` and friends are invisible to users.
- Internal error/exception class names. The consumer reads a _formatted message_, not a class.
- Generated-file internals the user never imports by name.
- Test utilities, fixtures, and build tooling.

### 3. Start from what you already know, then read the diff

If you made these changes in this session, **you are holding better evidence than the diff** and should spend it before opening one. You know what the user asked for, which parts were the point and which were scaffolding to get there, what you tried and abandoned, and what the user said when they reviewed it. That is the consumer's story; the diff is only its residue.

Write those answers down first. Then read `git diff <baseBranch>...HEAD` and `git log <baseBranch>..HEAD --oneline` to **confirm and fill gaps** — not to derive the story from scratch.

This matters because deriving intent from a diff is how implementation detail gets in. A diff shows a 200-line module you added; it cannot show that the module was scaffolding for a one-line warning the user will see. You know that. Use it, and say the one-line thing.

When you did _not_ author the change — reviewing someone's branch, writing a changeset after the fact — you have only the diff, so read it looking for the answers to exactly three questions, and be correspondingly more suspicious of your first draft:

1. **What can the consumer do, or observe, that differs from before?** New export, changed signature, different return value, different generated file, different terminal output, different error, a case that used to fail and now works.
2. **How does an affected consumer recognize themselves?** What layout, schema shape, call pattern, or version combination triggers it. This is what lets a reader skip the entry or act on it.
3. **What, if anything, must they change?** Usually nothing; when something, be concrete.

If a change produces no answer to question 1, it needs no changeset — see "When to skip" below.

**Ignore release automation in the range.** If the diff sweeps in a "Version Packages" commit — version bumps, `CHANGELOG.md` additions, and a _deleted_ `.changeset/*.md` — that is the release bot, not your branch. A deleted changeset file means an entry was already published, not that one is missing. Never re-author it. Scope your reading to the commits that are actually the branch's work.

### 4. Write the fact list, then the prose

Before drafting, write out (for yourself, not in the file) the answers to those three questions as flat statements in the consumer's vocabulary. Then compose the entry **only from that list**. Do not draft directly from the diff; that is how mechanics get in.

If a fact on your list can only be stated using a Tier 3 name, it is not a consumer fact. Either restate it in terms of what the consumer observes, or drop it.

### 5. Determine bump types

See "Bump heuristics" below.

The frontmatter routes the entry into each listed package's `CHANGELOG.md`, so list a package when a consumer **of that package** observes something. In a fixed-version group like `@confect/*` every package's version moves regardless, which means adding a package to the frontmatter buys nothing but a changelog entry its readers didn't need.

In particular: if a package's only changed surface is Tier 3, leave it out, even though its source changed. A hook shipped in `@confect/react` that happens to rest on new plumbing in `@confect/core` is a `@confect/react` entry. Someone reading `@confect/core`'s changelog and finding a paragraph about a React hook has been given noise.

### 6. Pick a filename

A short kebab-case slug describing the change (`add-cron-jobs`, `fix-pagination-cursor`). Check `.changeset/` to avoid collisions.

If the branch **already contains a changeset** covering this change, revise that file in place rather than adding a second one — two files mean two changelog entries for one change. Add a separate file only when the branch genuinely carries two independent changes.

### 7. Audit before saving

This step is not optional, and it is where most bad changesets get caught.

**Identifier check.** List every backticked identifier in your draft. For each, run:

```bash
grep -rn "SymbolName" apps/docs apps/example packages/*/src/index.ts
```

Hits in `apps/docs` or `apps/example` → Tier 1, keep. Hits only in a package `index.ts` → Tier 2, keep only if the consumer writes that name themselves. No hits, or hits only under `src/internal/` or `packages/cli/src/` → Tier 3. Delete it and rewrite the sentence around what the consumer observes instead. Do not "soften" a Tier 3 name by paraphrasing it — remove the fact or restate it as behavior.

**Sentence check.** Every sentence must answer one of the three questions from step 3: what changed for me, how do I know if I'm affected, what do I do about it. A sentence that answers none of them is implementation narration. Cut it. Common offenders:

- "The X now delegates to Y" / "…now starts from Z and chains…" — how it was built.
- "Refactored/extracted/moved …" with no observable consequence.
- "Added tests for …" — never belongs in a changelog.
- "Renamed the internal …" — invisible.
- Motivation backstory that doesn't change how the reader should react.

**Mechanism check.** The sentence check above catches narration that carries an internal name. It misses narration that doesn't — and that is what actually survives into finished entries. "Resolution now honors the `import` condition first and falls back to CommonJS", "the values are now compared before the cache is consulted": no internal identifier anywhere, every word true, and still a description of the algorithm rather than of anything the reader can see.

Test each sentence by asking **where the reader would observe this**. If the answer is a source file rather than their editor, their terminal, or their app's behavior, the sentence is mechanism. Replace it with the symptom it produces — a fix's entry needs the condition that triggered the bug and the fact that it no longer does, not the strategy that fixed it.

**Retirement check.** Ask whether this change lets the consumer delete something they currently write — an unsafe cast, a duplicated declaration, a version pin, an extra build step. If so, your draft must **quote that code as they wrote it**, even when it contains generated or internal-looking names the tiers would otherwise exclude:

```md
The workaround — `componentsGeneric().workpool as unknown as ComponentApi` — required an unsafe cast at every call site.
```

The tiers govern what you call the **new** API. Code already sitting in the consumer's repo is the opposite question: quoting it verbatim is what lets someone grep, find their three call sites, and delete them, and "previously this required a cast" leaves them to work that out alone. This is the sharpest available answer to question 2, so it outranks the tier rules whenever the two disagree. Keep it to exactly what they typed.

**Lead check.** The first sentence should name the thing the consumer _calls_ — the hook, the command, the writer method — before any type or helper that supports it. A supporting type can be perfectly documented and still be the wrong opening: readers scan for the operation they perform, not the type that constrains it. If your first sentence's subject is a type, try moving the operation into that slot and see whether the entry gets easier to recognize.

**Export-list check.** Look at the last sentence of every paragraph for a trailing inventory of secondary exports — "`FooArgs`, `FooItem`, and `FooOptions` are also exported", "the supporting types … are exported alongside it", "along with the types needed to …". **Delete it.** No rewrite, no trimming to the two most useful names.

This check is separate because the two above cannot catch it. Every name in such a sentence is a real export, so the identifier check passes; the sentence looks like it answers "what changed for me", so the sentence check passes. It survives on those technicalities and is the single most common way supporting type surface gets back into a finished entry. A consumer meets those names through autocomplete and the docs at the moment they need them, which is the only moment they mean anything.

**Length check.** If the entry runs past a paragraph, confirm each additional paragraph is earned by the escalation ladder below rather than by detail that accumulated from the diff.

## Writing the description

### Length, by default

The default entry is **one sentence** naming the affected API and stating what changed:

```md
Add `Cron.prev` and reverse iteration support, aligning next/prev lookup tables and fixing DST handling symmetry.
```

Escalate only for a reason:

- **A second short paragraph** when the symptom, trigger condition, or new behavior isn't obvious from the summary — i.e. when the reader can't tell whether they're affected. A brand-new API whose eligibility condition is non-obvious ("this hook only applies to a query whose args include …") earns this paragraph: stating the condition is answering question 2, not padding.
- **A third paragraph or a fenced code sample** only when the consumer must rewrite call sites, or when a concrete snippet is genuinely shorter than the prose describing it.

Every escalation must be traceable to a fact on your list from step 4. Length that comes from "there was more in the diff" is the failure this document exists to prevent.

### Tone

- **Imperative, present-tense summary.** "Add", "Fix", "Remove", "Replace" — not "Added", "Fixed".
- **Present tense for explanation.** "Now …", "Previously …", "When X happens, Y …".
- **Plain technical prose.** No marketing language, no emojis, no exclamation points.
- **Rationale in the body, not the summary.** The summary states _what_; a second paragraph explains _why_ only when it isn't self-evident.

### Naming things

Lead with the API the consumer recognizes. `FunctionSpec.publicQuery`, `useQuery(refs.public.<group>.<fn>)`, `HttpClient.layer`, `TestConfect.layer`, `HttpApi.make`, the generated services (`DatabaseReader`, `QueryRunner`) — these appear in docs and example code. `RegisteredConvexFunction`, `SchemaToValidator`, `writeGroupAssembly`, `Refs.make` do not.

In the consumer's terms, that means:

- **Layouts the user writes** (`confect/notes.spec.ts` beside a sibling `confect/notes/` directory), not the pipeline's model of them (import bindings, assembly chains, `_generated/*` artifacts they never name).
- **Refs, hooks, types, and CLI commands the user calls** (`refs.notes.list`, `useQuery(refs.notes.list)`, `confect codegen`, `confect dev`), not the builders that produce them.
- **Error messages the user reads in their terminal** — "child segment `notes` collides with a function on the parent spec" — not the exception class that carries them.
- **CLI behavioral splits when user-visible**: whether `confect codegen` exits non-zero while `confect dev` logs and keeps watching decides whether someone's CI catches a regression. State both, in command-line terms.

If a refactor only changes how a public API is implemented, with no surface or behavior change, either skip the changeset or write one patch-level sentence that names no internal moving parts.

**Bad — internal symbols and pipeline mechanics:**

```md
Fix `writeGroupAssembly` losing the parent's `FunctionSpec` entries when a leaf module also has child groups. The assembly now starts from the leaf's import binding and chains `.addGroupAt(...)` for each child, so `Refs.make` no longer drops the parent's functions from `_generated/spec.ts`. Codegen also throws a new `ParentChildNameCollisionError` when a child segment shadows a parent function.
```

**Good — authored layout, resulting refs, observed CLI behavior:**

```md
Allow a `confect/{path}.spec.ts` file to declare functions even when a sibling `confect/{path}/` subdirectory contains further specs.

Previously, every function on the parent spec silently disappeared from the generated api and refs in this layout: `refs.{path}.{fn}` was not defined, while `refs.{path}.{child}.{fn}` (from the subdirectory specs) worked.

Both `confect codegen` and `confect dev` now generate the parent's functions and the subdirectory's groups side by side. Codegen also reports a clear error when the parent spec declares a function or subgroup whose name matches one of the subdirectory's child segments — `confect codegen` exits non-zero, while `confect dev` logs it and keeps watching.
```

Note what survives the rewrite: the layout the user authors, the refs they access, the commands they run, and the exit behavior. Every internal name is gone, and the entry is _more_ useful, not less.

### When internal detail is allowed

Only when it is the shortest way to explain something the consumer will observe or must act on. A type-level cause the user hits as a compile error, a version-compatibility mechanism that determines which versions to install, an upstream bug whose number they'll want — these earn a clause. The test is whether removing the detail would leave the reader unable to recognize their situation or decide what to do. If removing it costs the reader nothing, it was for you, not them.

### Code and API references

- **Backtick every symbol the reader might search for** — types, functions, hooks, module names, flags, env vars, file paths.
- **Module-qualify names** (`Effect.fork`, `Schema.decode`) so they're findable in an editor.
- **No prose paraphrases of identifiers.** Write `` `useQuery` ``, not "the query hook".
- **Fenced blocks** for examples — TypeScript by default, `bash` for CLI behavior; include the import line when the path is non-obvious.

### Before/After for behavioral changes

When consumers must rewrite call sites, show two adjacent fenced blocks labelled **Before** and **After**. Don't rely on prose alone for migration guidance.

````md
**Before:**

```ts
Effect.if(true, { onTrue: Effect.succeed("true") });
```

**After:**

```ts
Effect.if(true, { onTrue: () => Effect.succeed("true") });
```
````

### Breaking changes

For non-trivial breaks, include a one-line summary naming what broke, a `### Breaking Changes` section listing removed/renamed/retyped **public** surfaces as bullets, and a short migration paragraph with steps the user can follow without reading the diff. Pair with `### New Features` if the same change adds APIs.

A break in a Tier 3 name is not a breaking change for consumers — it's not a changeset at all.

### Multi-package entries

Use **one body paragraph** describing the change across all listed packages; the frontmatter conveys _which_ packages, the body conveys _what_ changed. If different packages need substantively different consumer guidance, prefer two changesets over one mixed body.

### What to omit

- **No PR or commit links** — automation injects those.
- **No `Thanks @author`** — automation adds it.
- **No "this commit", "this PR", "in this change"** — release-note prose, not code-review prose.
- **No file paths into `packages/*/src/`** — consumers don't have that tree.
- **No vague summaries** ("Improve performance", "Fix bug", "Update types") — name the affected API.
- **No enumerations of supporting exports.** "Also exports `FooArgs`, `FooItem`, and `FooOptions`" is an export list, not a release note. The reader learns those from autocomplete.
- **No claim you could not verify.** If you inferred a behavior by reading types rather than running anything — that some ref shape won't typecheck, that an option is now optional — either confirm it or leave it out. A changelog is the wrong place to publish a guess, and an inferred type-level assertion that turns out to be an unintended asymmetry in the code documents a bug as a feature.

`closes #1234` may be appended inline when the issue adds context for the reader; otherwise omit.

## Bump heuristics

- **`major`** — removed or renamed public exports, or runtime behavior changes that break existing call sites. In a fixed-version group, one major bumps the whole group; reserve it for genuine breaking releases.
- **`minor`** — new consumer-facing exports, new optional parameters, new capabilities, or observable but backward-compatible behavior refinements.
- **`patch`** — bug fixes, typing refinements that don't change call-site shape, performance improvements, dependency range changes, deprecation notices, internal changes that surface observably.

When in doubt, err toward minor for new things and patch for fixes; reach for major only when the consumer must change their code.

## When to skip

No changeset for: pure internal refactors with no observable consequence, changes confined to Tier 3 names, repository tooling, CI, test-only changes, and changes to `apps/example` or `apps/docs` alone.

Also no changeset for comment-only changes — including comments that exist to steer tooling rather than to document, such as lint suppressions, `@ts-expect-error`, and formatter pragmas. The test isn't whether the comment does something; it's whether the built artifact and the type surface are identical in every way a consumer can observe.

**Dependency changes split on where they land.** A bump confined to `devDependencies`, root toolchain packages, or the private workspaces (`apps/docs`, `apps/example`) is invisible — consumers never install those. A change to any published package's `dependencies` or `peerDependencies` range _is_ consumer-facing (it decides what resolves in their tree, and can conflict with their own pins) and gets a patch entry naming the old and new ranges. Diff `packages/*/package.json` specifically before concluding a dependency PR is internal.

Reaching "no changeset" is a legitimate and common outcome. Say so plainly rather than manufacturing an entry — a changelog line describing something no consumer can observe is worse than no line, because every reader pays to read it.
