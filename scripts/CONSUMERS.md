# Packed consumer compatibility

This gate checks complete application graphs outside the workspace. It does not
replace the pack-content allow/deny tests, backend integration suites, or browser
tests.

## Run a profile

Build first, then select one application, resolution lane, and package manager:

```sh
pnpm build
pnpm check:consumers --profile react --lane baseline --manager npm
pnpm check:consumers --profile react --lane fresh --manager pnpm
pnpm check:consumers --profile foldkit --lane baseline --manager npm
```

Each invocation creates an isolated temporary directory, runs real `pnpm pack`
with pack lifecycle scripts, checks the rewritten manifests, and installs the
tarballs with strict peers. It does not copy the workspace lockfile or inherit
workspace overrides, source aliases, user package-manager settings, credentials,
or `NODE_PATH`. pnpm approves only esbuild builds in that disposable project;
npm uses its normal install scripts. Neither installer uses force, legacy peers,
or scripts-skipping.

The package-manager executable is resolved explicitly before PATH is scrubbed.
External toolchain installations (including GitHub's `setup-pnpm/node_modules`)
remain usable without restoring workspace executable aliases or user settings.
Consumer checks currently run on Linux with Node, Bun, pnpm, npm, and `tar`;
the existing package suites retain their separate Windows coverage.

The runner checks all reachable installed peer edges, physical package paths,
the shared Effect instance, candidate versions, and package-manager tarball
provenance. Every Confect package in the profile is a direct tarball dependency,
so unpublished Changesets version bumps do not fall back to registry peers.
Installer peer warnings fail even when the command exits zero.

On a valid graph, the installed CLI generates a representative application. Its
public imports and generated refs/services are typechecked against installed
declarations, then its schema/ref/Layer smoke runs. No workspace aliases are used.

## Profiles and claims

`consumerCompatibility.ts` owns the small profile definition. Both profiles
include core, server, and CLI; React adds `@confect/react`, while Foldkit adds
`@confect/js`, `@confect/foldkit`, and Foldkit's browser platform peer. These are
whole applications, not independently installable client and backend snippets.

- **Baseline** selects Effect 4.0.1, platform-node 4.0.1 **and node-shared 4.0.1**,
  plus Convex 1.45.0. It is a coherent minimum-Effect baseline with a selected
  React 19.3.0 host, not a claim that every package is at its absolute minimum.
  Unrelated transitive dependencies still resolve normally; this is not a frozen
  lockfile or a proof of every allowed version.
- **Fresh** uses the declared host ranges and normal fresh resolution, with no
  node-shared selection. It records the versions the installer actually chose;
  it is not a resolver that maximizes every transitive version. pnpm's release-age
  delay is disabled for this isolated compatibility probe so new upstream
  releases are visible.

### Foldkit remains a release-acceptance blocker

On 2026-10-12, source and published Confect 10.2.0 require Effect `^4.0.1` through
server/CLI. Foldkit 0.165.0, the stable version admitted by `^0.165.0`, requires
exactly `4.0.0`. Latest Foldkit 0.168.0 also requires 4.0.0 and is outside that
range. Workspace overrides hide this incompatibility; the isolated runner must
fail it.

The Foldkit row is **not** an expected-failure acceptance test or an unsupported
profile. Reproducing the conflict in regression tests does not make it pass.
An explicit support decision is required: restore a compatible supported graph,
or revise the advertised support claim through the normal release/documentation
process. This tooling does neither. Passing React rows do not establish complete
release readiness.

The Packages workflow runs only the four React rows (two managers × two lanes).
It has no `continue-on-error` or expected-failure Foldkit job. The missing passing
Foldkit row is the explicit blocker above, not evidence of full release coverage.

## Reports and final candidate artifacts

`--report FILE` writes the requested and selected versions, real paths, candidate
tarball SHA-512 identities, tool versions and executable paths, phase outputs, and failure details as
JSON. By default it writes `result.json` in the temporary consumer directory and
prints that location. The directory is retained for diagnosis; remove it when
finished. Do not commit reports, install trees, or lockfiles.

Pass `--artifacts /absolute/candidate-directory` to validate previously packed
artifacts rather than pack again. The runner requires pnpm's normal tarball names
for the current checkout's package versions, verifies published dependency
rewriting against that checkout, and installs those exact tarballs. This is the
same runner intended for the final versioned release candidates after Changesets,
not a second source-manifest-only check.

Production-required release wiring is deliberately pending the Foldkit support
decision. Before enabling it, run both managers and both lanes for every claimed
profile against final versioned artifacts and require successful acceptance
before publication. This PR does not change `release` or publish anything.

The fast regression tests live in `consumerCompatibility.test.ts` and
`checkConsumers.test.ts`; `bun test ./scripts` discovers them. They cover the
recorded Foldkit conflict, transitive-minimum drift, warning-only installers,
unpublished cohort rewriting, nested resolution, and configuration isolation.
