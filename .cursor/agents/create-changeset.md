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

- `major` — breaking changes to the package's public API
- `minor` — new features, new exports, new capabilities
- `patch` — bug fixes, internal refactors, documentation fixes, dependency updates

### 4. Pick a filename

Use a short kebab-case slug describing the change (e.g., `add-cron-jobs`, `fix-pagination-cursor`). Check existing files in `.changeset/` to avoid collisions.

### 5. Write the changeset

Create `.changeset/<name>.md` with the frontmatter and description.

## Writing the description

- Write for **package consumers** reading a changelog, not for code reviewers.
- Lead with what changed: "Add ...", "Fix ...", "Remove ...", "Replace ...".
- Mention the key API surfaces affected (module names, function names, types).
- For breaking changes, briefly note what consumers need to update.
- One to three sentences is typical. Use a short paragraph for complex changes.
