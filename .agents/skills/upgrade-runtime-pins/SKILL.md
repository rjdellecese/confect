---
name: upgrade-runtime-pins
description: Upgrade the runtime version pins that live outside package.json dependency maps (Node and pnpm) and open a PR
---

Upgrade the repo's pinned runtime versions and open a PR for review. Never
merge it yourself.

## Scope

Version pins that live outside `package.json` dependency maps: `.node-version`
and the `packageManager` field in the root `package.json`. Not every consumer
reads these files — some CI setup actions under
`.github/actions/` resolve Node or pnpm from other sources — so after updating
a pin, check where each version is actually resolved and call out any consumer
the bump doesn't reach in the PR description. Do not touch GitHub Actions
`uses:` versions or devcontainer config — Dependabot owns those.

## Rules

- Bump within each tool's current major line. Take a major line (a new Node
  LTS or pnpm major) only if the release notes show nothing that
  affects this repo and the checks stay green; otherwise describe the
  available jump in the PR description (or in your final report, if the run
  ends up applying nothing and opens no PR).
- **Never change `engines` floors** in the published packages — those are
  published-surface policy and belong to a deliberate, changeset-recorded
  decision, not this routine.

## Delivering

1. If nothing gets applied, say so and stop — no branch, no PR, even if a
   major-line jump was spotted and deferred; the next scheduled run will
   surface it again.
2. Verify by reinstalling with the new versions and running the full repo
   checks (`pnpm check`, `pnpm test`, `pnpm build`). Anything the local
   environment genuinely can't run, leave to the PR's CI — and get it green.
3. Publish a Capy-owned PR against `main`; do not open it with `gh`. Note in the
   body which pins moved and link their release notes. If an earlier PR from
   this automation is still open, update it when safe or stop and report it
   rather than creating a duplicate.
