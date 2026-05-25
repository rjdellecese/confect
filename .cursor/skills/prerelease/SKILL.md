---
name: prerelease
description: Ship a major version of `@confect/*` as iterative Changesets prereleases on a dedicated `vN` release branch, then graduate to stable. Use whenever the user wants to cut a beta/next/prerelease, set up a `vN` branch, run `pnpm changeset pre enter`/`pre exit`, publish `X.0.0-next.N` versions under the npm `next` dist-tag, or merge a prerelease line back into `main`.
---

# Prereleases

Major versions of `@confect/*` ship as iterative prereleases on a dedicated `vN` branch under the npm `next` dist-tag, then graduate to stable when `vN` merges into `main`.

For Changesets-specific behavior and caveats, see the upstream [Changesets prereleases docs](https://github.com/changesets/changesets/blob/main/docs/prereleases.md). Read them in full before your first prerelease cycle — the docs themselves open with: "Prereleases are very complicated! Using them requires a thorough understanding of all parts of npm publishes. Mistakes can lead to repository and publish states that are very hard to fix."

## Conventions

- All `@confect/*` packages version together via the `fixed` group in `.changeset/config.json`, so a single `pnpm changeset` covers every package being bumped for the major.
- The release branch is named after the target major (`v9`, `v10`, …). `main` continues to receive patch releases of the current stable line while `vN` is in flight.
- A dedicated `release-vN.yml` workflow publishes prereleases when changes land on `vN`. The default `release.yml` keeps publishing stable from `main` and is left untouched.
- The Changesets `pre` tag is `next`, which also becomes the npm dist-tag. Consumers opt in with `pnpm add @confect/server@next`; `latest` continues to resolve to the current stable line.
- `pnpm release` (defined in the root `package.json`) is `pnpm build && changeset publish`. It works the same in pre mode and stable mode — the difference is purely in what `.changeset/pre.json` / the changesets folder contain at publish time.

## Never run prereleases on `main`

The upstream docs are explicit on this:

> If you decide to do prereleases from the default branch of your repository, without having a branch for your last stable release without the prerelease changes, you will block other changes until you are ready to exit prerelease mode. We thoroughly recommend only running prereleases from a branch other than the default branch.

Always use a dedicated `vN` branch so `main` can keep cutting patch releases of the current stable line.

## Caveats to keep in mind

These are from the Changesets docs but are easy to miss:

- **Prerelease versions bump dependents more aggressively than stable releases.** Most semver ranges do not satisfy prerelease versions (e.g. `^5.0.0` is not satisfied by `5.1.0-next.0`), so `changeset version` will bump packages depending on a prereleased package even when the dependent itself has no changeset. With the `@confect/*` fixed group this is mostly invisible, but expect every package in the group to move in lockstep on every `next.N`.
- **New packages introduced during a prerelease cycle publish to the `latest` dist-tag, not `next`.** A package being published for the first time always goes to `latest`, and continues going to `latest` for subsequent prereleases until the cycle exits. If a brand-new `@confect/foo` is added mid-cycle, its initial publish is *not* gated by `@next` and will be visible to all consumers immediately.

## Entering prerelease mode

1. **Create the release branch off `main`.**

   ```bash
   git switch main && git pull
   git switch -c v9
   ```

2. **Point `baseBranch` at the release branch** in `.changeset/config.json` so `changeset version` compares against the right history:

   ```diff
   - "baseBranch": "main",
   + "baseBranch": "v9",
   ```

3. **Enter pre mode with the `next` tag.** This creates `.changeset/pre.json`, which locks subsequent `changeset version` runs into producing `X.0.0-next.N` and tags the npm publish with `next`.

   ```bash
   pnpm changeset pre enter next
   ```

4. **Add a dedicated release workflow** at `.github/workflows/release-v9.yml`, modeled on the current `release.yml` but triggered on `v9` and passing `branch: v9` to `changesets/action`. Omit any post-publish "push to release branch" step from `release.yml` that drives docs deployment — that branch tracks the stable line and the prerelease cycle must not touch it.

   ```yaml
   name: Release v9

   on:
     push:
       branches:
         - v9

   concurrency: ${{ github.workflow }}-${{ github.ref }}

   jobs:
     release:
       name: Release
       runs-on: ubuntu-latest
       permissions:
         contents: write
         id-token: write
         pull-requests: write

       steps:
         - uses: actions/checkout@v6

         - name: Get pnpm version from package.json
           id: pnpm-version
           shell: bash
           run: echo "pnpm_version=$(node -p 'require(`./package.json`).engines.pnpm')" >> $GITHUB_OUTPUT

         - uses: pnpm/action-setup@v6
           with:
             version: ${{ steps.pnpm-version.outputs.pnpm_version }}

         - uses: actions/setup-node@v6
           with:
             node-version-file: "package.json"
             cache: "pnpm"
             registry-url: "https://registry.npmjs.org"

         - run: pnpm install

         - uses: changesets/action@v1
           with:
             publish: pnpm release
             branch: v9
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

5. **Mirror the branch into the other CI workflows.** Add `- v9` to the `push.branches` and `pull_request.branches` lists in any CI workflows that gate `main` (typically `docs.yml`, `example.yml`, `packages.yml`) so PRs against `v9` run the same checks as PRs against `main`.

6. **Commit and push.**

   ```bash
   git add .changeset/config.json .changeset/pre.json .github/workflows
   git commit -m "Add v9 prerelease workflow and enter prerelease mode"
   git push -u origin v9
   ```

After the push, `changesets/action` opens a `Version Packages (next)` PR against `v9`. From this point on, retarget every PR that should ship as part of the v9 line at `v9` instead of `main`.

## Publishing iterative prereleases

While `.changeset/pre.json` exists on `v9`:

- Author changesets normally with `pnpm changeset` on feature branches targeting `v9`. Each merged PR is appended to the open `Version Packages (next)` PR.
- Merging the `Version Packages (next)` PR bumps the next `X.0.0-next.N` and publishes under the `next` dist-tag.
- The merged changeset files are kept around — Changesets needs them to compose the final stable changelog on exit. Do not delete them manually.

There is no required cadence; ship as many `next.N`s as the major needs.

## Exiting prerelease mode

1. **Exit pre mode and apply the final versions on the release branch.** Both happen in a single commit, directly on `v9` (no PR), matching the Changesets docs' recommended exit workflow.

   ```bash
   git switch v9 && git pull
   pnpm changeset pre exit
   pnpm changeset version
   git add .
   git commit -m "Exit prerelease mode and version packages"
   git push
   ```

   `pre exit` deletes `.changeset/pre.json`. `changeset version` then consumes every changeset accumulated during the prerelease cycle and writes the final stable versions (e.g. `9.0.0`) into each `package.json`. Pushing triggers `release-v9.yml`; with no remaining changesets, `changesets/action` skips opening a Version Packages PR and goes straight to `pnpm release`, publishing the final stable to `latest`.

2. **Open a PR merging `vN` back into `main`** with the major as the title (e.g. `v9`). Use a merge commit so the prerelease history is preserved in `main`.

3. **In a follow-up commit on `main`, clean up the branch-specific machinery.** In one commit:

   - Revert `.changeset/config.json` `baseBranch` back to `main`.
   - Remove `- v9` from `push.branches` and `pull_request.branches` in every workflow that referenced it.
   - Delete `.github/workflows/release-v9.yml`. The default `release.yml` already triggers on `main` and resumes publishing the (now-bumped) stable line.

   ```bash
   git switch main && git pull
   # edit configs as above
   git rm .github/workflows/release-v9.yml
   git add .changeset/config.json .github/workflows
   git commit -m "Update \`v9\` branch references to \`main\`"
   git push
   ```

4. **Delete the release branch** once `main` has fully absorbed it.

   ```bash
   git push origin --delete v9
   git branch -d v9
   ```

## Quick reference

| Step | Command |
| --- | --- |
| Enter pre mode | `pnpm changeset pre enter next` |
| Author a changeset | `pnpm changeset` |
| Apply versions locally (the action normally does this) | `pnpm changeset version` |
| Exit pre mode | `pnpm changeset pre exit` |
| Publish manually (the action normally does this) | `pnpm release` |
| Install a prerelease | `pnpm add @confect/server@next` |
