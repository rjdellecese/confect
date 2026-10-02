---
name: managing-prereleases
description: Graduate a Changesets 3 prerelease to stable on main, or plan an optional future prerelease cycle on a dedicated branch.
---

# Managing prereleases

Stable releases publish from `main` through `.github/workflows/release.yml`.
All `@confect/*` packages belong to one fixed version group. A major can ship
directly from `main`; a prerelease cycle is optional, not a release requirement.

## Graduate a prerelease to stable

Keep the final candidate on its prerelease branch until it has passed the
required checks. Prepare graduation separately so removing branch workflows
does not disable the final candidate's publication.

1. Fetch `main` and the prerelease branch. Reconcile the current `main` history
   with a real merge, not a squash or a content-only replay. Preserve changeset
   provenance: an ID already in `.changeset/pre/` must not also be pending in
   `.changeset/`. Do not invent a second changeset for changes already shipped
   under their original ID.
2. Review `.changeset/pre/` and pending changesets for the stable release notes.
   Changesets 3 moves consumed prerelease changesets into `.changeset/pre/`;
   these are inputs to the stable changelog, not disposable artifacts. For an
   explicitly requested consolidation, account for every consumed and pending
   entry against the last stable public API and replace them with one reviewed
   release changeset. Describe final behavior rather than intermediate
   prerelease migrations, omit changes already released on the stable line,
   and preserve the existing prerelease changelog sections and Git history.
   Outside that reviewed consolidation, remove entries only for an explicitly
   reviewed duplicate or erroneous note.
3. Run `pnpm changeset pre exit` on the graduation branch. This changes
   `.changeset/pre.json` to `mode: "exit"`; it does **not** remove the file or
   change package versions. Never hand-delete that file to exit pre mode.
4. Set `.changeset/config.json` `baseBranch` to `main`, remove the old prerelease
   branch from workflow triggers, and retire its branch-specific automation.
   Do not run stable publishing on the old branch. Keep `release` intact: it is
   the Mintlify deployment branch, not the package prerelease branch.
5. Open the graduation PR against `main`. Use a merge commit when the PR carries
   the prerelease history so `main` retains ancestry. Do not merge without the
   user's explicit approval. Run the repository checks and backend suites before
   graduation, and inspect the stable release plan in a disposable checkout.
6. After graduation merges, the existing Changesets action on `main` runs
   `pnpm version-packages` to prepare the stable Version Packages PR. The
   `changeset version` step consumes the exit state and archived changesets,
   removes `pre.json` and consumed prerelease notes, writes the stable versions,
   and composes their changelogs. Review that PR before merging it with approval.
   If the user instead asks to include versioning in graduation, run the same
   command on the graduation branch and review those generated changes there;
   do not version both ways.
7. On the merged stable version commit, `release.yml` runs `pnpm release`
   (`pnpm build && changeset publish`). Verify the npm versions and `latest`
   dist-tags, release tags, and docs deployment before reporting completion.
   Retire the old package prerelease branch only after explicit approval; never
   delete `release` as part of that cleanup.

The exit behavior above was checked with Changesets 3.0.3 in an isolated
workspace: `1.0.0` plus a major changeset became `2.0.0-next.0`, then `pre exit`
left `mode: "exit"`, and the following `version` produced `2.0.0`, removed the
pre state, and included the archived note in the stable changelog. Recheck this
behavior when upgrading Changesets; do not simulate graduation in the active
checkout unless versioning is actually requested.

## Documentation releases

Mintlify serves one current site from `release:apps/docs`. A successful stable
package publish deploys the matching `main` commit. Docs-only deployments use
the `release-docs` skill. Old versioned page URLs redirect to the current pages;
there is no archived site or version selector.

## Optional future prereleases

Read the upstream [prerelease guide](https://changesets.dev/guide/prereleases)
before starting another cycle. Use a dedicated `vN` branch, never `main`, so
stable fixes can continue publishing independently.

- Set that branch's Changesets `baseBranch` to `vN` and run
  `pnpm changeset pre enter next`. Add a changeset for the intended major bump.
- Extend the existing `release.yml` and ordinary CI triggers for `vN` in a
  reviewed change. Reuse `release.yml`: npm trusted publishing is tied to its
  filename. Keep docs deployment restricted to `main`; prereleases must not
  replace the public stable docs. Use a separate preview if one is needed.
- Version and publish iterative candidates through Changesets, retaining the
  `.changeset/pre/` provenance. Verify npm dist-tags, especially when introducing
  a package that has never been published. Consumers opt in with `@next`.
- Merge current `main` into `vN` at each checkpoint and inspect changeset IDs,
  retractions, and dependency conflicts explicitly. There are no active sync
  jobs or freshness-label checks; add automation only when a new cycle needs it.
- Follow the graduation procedure above when the candidate is ready.
