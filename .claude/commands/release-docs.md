---
description: Deploy docs for the current release by updating the release branch, without publishing a new version
allowed-tools: Bash(git fetch:*), Bash(git log:*), Bash(git diff:*), Bash(gh workflow run:*), Bash(gh run list:*), Bash(gh run watch:*)
---

Deploy the docs on `main` (or the ref given in $ARGUMENTS, if any) by triggering
the "Docs Release" workflow (`.github/workflows/docs-release.yml`), which
force-pushes that ref to the `release` branch. Mintlify deploys docs from
`release`, so this publishes docs updates without cutting a new npm release.

Follow these steps:

1. Run `git fetch origin main release` and show what would be deployed:
   - Docs changes: `git log --oneline origin/release..<ref> -- apps/docs`
   - Everything else: `git log --oneline origin/release..<ref> -- ':!apps/docs'`
2. If there are no commits between `origin/release` and the ref, tell me the
   release branch is already up to date and stop.
3. If any of the non-docs commits look like unreleased package changes (e.g.
   changes under `packages/` or pending changesets in `.changeset/`), point
   them out and warn me that any docs written for those unreleased changes
   would go live too. Ask me to confirm before proceeding.
4. Trigger the workflow: `gh workflow run docs-release.yml --ref <ref>`
   (default ref: `main`).
5. Watch it to completion (`gh run list --workflow=docs-release.yml`, then
   `gh run watch <run-id>`) and report whether the `release` branch was
   updated successfully.
