---
name: release-docs
description: Deploy a docs-only update for the published v9 or v10 line without publishing new packages
---

# Release documentation

Publish a docs-only update through the "Docs Release" workflow
(`.github/workflows/docs-release.yml`). The workflow updates one pinned source
in the generated `release` branch, rebuilds both versions, validates the
combined Mintlify site, and pushes a deployment commit. It never publishes npm
packages.

The normal source branches are:

- `v9`: `main`
- `v10`: `v10` during the prerelease cycle, then `main` after v10 graduates

Follow these steps:

1. Identify the version and source ref. Default to `v9` / `main` unless the
   request names v10 or another ref.
2. Run `git fetch origin main release --tags` (and fetch `v10` while its
   prerelease branch exists), then read the version's currently deployed source
   from `.docs-release.json` on `origin/release`:

   ```bash
   git show origin/release:.docs-release.json | jq -r '.versions.v9.source'
   git show origin/release:.docs-release.json | jq -r '.versions.v10.source'
   ```

   Before the first versioned deployment, the manifest does not exist. Use
   `origin/release` as the deployed v9 source and the latest
   `@confect/core@10.0.0-next.*` tag as the deployed v10 source.

3. Show what would change between the deployed source and the requested ref:
   - Docs: `git log --oneline <deployed>..<ref> -- apps/docs`
   - Everything else:
     `git log --oneline <deployed>..<ref> -- ':!apps/docs'`
4. If there are no commits between the deployed source and the requested ref,
   say that version is already up to date and stop.
5. If non-docs commits include unreleased package changes or pending
   changesets, warn that docs describing those changes would become public and
   ask for confirmation before continuing. The workflow also rejects a source
   that is not part of the selected version's source branch.
6. Dispatch the workflow from `main`, passing the selected version and source:

   ```bash
   gh workflow run docs-release.yml --ref main \
     -f version=<v9-or-v10> \
     -f source_ref=<ref>
   ```

7. Find and watch the new run with `gh run list --workflow=docs-release.yml`
   and `gh run watch <run-id>`. After the run succeeds, refresh the deployment
   branch before reporting its manifest:

   ```bash
   git fetch --force origin \
     refs/heads/release:refs/remotes/origin/release
   git show origin/release:.docs-release.json | jq -r \
     '.versions.<v9-or-v10>.source'
   ```

   Report the validation result and the refreshed pinned source SHA.
