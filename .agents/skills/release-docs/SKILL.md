---
name: release-docs
description: Deploy the current documentation from a specified main commit without publishing packages.
---

# Release documentation

The "Docs Release" workflow (`.github/workflows/docs-release.yml`) publishes
`apps/docs` from a specified commit on `main`, including API reference pages
generated from that commit's package sources. It never versions or publishes
packages. Mintlify continues to deploy `release:apps/docs`, but that branch is
now only a docs snapshot, not a copy of the source repository or an archive of
older documentation versions.

1. Fetch the current refs:

   ```bash
   git fetch origin \
     refs/heads/main:refs/remotes/origin/main \
     refs/heads/release:refs/remotes/origin/release
   ```

2. Resolve the requested source to a full commit SHA, defaulting to
   `origin/main`. Require it to be an ancestor of `origin/main`:

   ```bash
   source_sha=$(git rev-parse --verify 'origin/main^{commit}')
   git merge-base --is-ancestor "$source_sha" origin/main
   git diff --stat origin/release "$source_sha" -- apps/docs
   git diff origin/release "$source_sha" -- apps/docs
   ```

   Substitute a reviewed ref when the user requests a different source; never
   interpolate untrusted input into a shell command. The docs diff alone cannot
   establish that deployment is up to date: API pages also depend on package
   sources and generator tooling. Let the workflow compare the completed
   snapshot. A first deployment also removes the old manifest, versioned pages,
   and stale workflows.

3. Require a stable v10-or-later package version and its published
   `@confect/core@<version>` Git tag as an ancestor of the source. The workflow
   rejects prereleases, retired v9 sources, and versions with no release tag;
   docs-only deployment cannot promote the site before stable graduation is
   published. Check the requested docs against published behavior and pending
   changesets too: a release tag does not prove that later source changes or
   generated API pages describe only shipped features. Warn and get confirmation
   for unreleased features or an intentional rollback to an older main commit.
4. Dispatch from `main` with the resolved SHA:

   ```bash
   gh workflow run docs-release.yml --ref main -f source_ref="$source_sha"
   ```

5. Identify the new run with `gh run list --workflow=docs-release.yml` and watch
   it with `gh run watch <run-id>`. All docs deployments share one serialized
   queue. The workflow checks out the selected source before installing its
   dependencies with a frozen lockfile, using its runtime pins and docs setup.
   It retains the current workflow's preparation script so older source commits
   still receive the publication guards. If the source has `scripts/docsApi.ts`,
   preparation runs `pnpm docs:api --check --out <temporary-docs-root>` from that
   source checkout. Generation must succeed before the release tree is replaced.
   Sources predating the generator retain their exact tracked docs snapshot.
   The workflow validates the completed snapshot with Mintlify, commits it on
   top of `release`, and performs an ordinary push; a concurrent external write
   fails the push rather than overwriting history. Never force-push a docs
   deployment.
6. After success, fetch `release` again and verify the deployed tree:

   ```bash
   git fetch origin refs/heads/release:refs/remotes/origin/release
   git ls-tree --name-only origin/release
   git log -1 --format='%H %s' origin/release
   ```

   The root should contain only `apps`, with only `docs` below it. The deployment
   commit subject records the source SHA; there is no release manifest. Report
   the source and deployment SHAs and validation result. Confirm the public site
   has updated before claiming Mintlify has finished deploying.

   For sources without `scripts/docsApi.ts`, verify the exact tracked snapshot
   with `git diff --exit-code "$source_sha" origin/release -- apps/docs`. For
   generator-enabled sources, that comparison is expected to differ in
   `apps/docs/api/reference` and `apps/docs/docs.json`. Verify these against a
   fresh generation, not against tracked files alone: use a separate clean
   checkout at the source SHA, install its frozen dependencies with its pinned
   runtimes, archive its `apps/docs` into a temporary directory, and run
   `pnpm docs:api --check --out <temporary-directory>/apps/docs` from the source
   checkout. Compare the entire resulting docs directory with the deployed
   `release:apps/docs` tree. Do not generate into the source checkout for this
   verification.

The preparation script requires the source checkout's HEAD to match the
requested SHA with no staged or unstaged tracked changes. It archives the
tracked docs and generates API pages in a temporary directory, then replaces
the destination's tracked tree, removing old `.github/workflows` on the first
deployment. The destination must be a clean, separate checkout of `release`,
including no untracked or ignored files. The script does not commit or push;
those actions belong to the workflow after validation. The source remains
untouched.
