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
pnpm check:consumers --profile foldkit --lane fresh --manager pnpm
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

- **Baseline** selects Effect 4.1.0, platform-node 4.1.0 **and node-shared 4.1.0**,
  plus Convex 1.45.0. It is a coherent minimum-Effect baseline with a selected
  React 19.3.0 host or Foldkit 0.170.0 and platform-browser 4.1.0, not a claim
  that every package is at its absolute minimum.
  Unrelated transitive dependencies still resolve normally; this is not a frozen
  lockfile or a proof of every allowed version.
- **Fresh** uses the declared host ranges and normal fresh resolution, with no
  node-shared selection. It records the versions the installer actually chose;
  it is not a resolver that maximizes every transitive version. pnpm's release-age
  delay is disabled for this isolated compatibility probe so new upstream
  releases are visible.

### Supported Foldkit graph

The Foldkit profile selects `foldkit: ^0.170.0` and
`@effect/platform-browser: ~4.1.0` in the fresh lane, alongside Effect `~4.1.0`.
These ranges admit patch releases within the verified minor versions. The
adapter, Foldkit, server, and CLI can share one Effect installation without
overrides.

The Packages workflow requires all eight rows: two profiles × two managers ×
two lanes. Neither profile is an expected failure, and neither uses
`continue-on-error`. The daily compatibility automation also checks both
profiles with fresh npm and pnpm resolution, even when main has not changed.

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

The release workflow does not yet run this gate against final versioned
artifacts before publication. That is separate from the PR and daily checks:
release acceptance should run both managers and both lanes for every claimed
profile against those exact artifacts.

The fast regression tests live in `consumerCompatibility.test.ts` and
`checkConsumers.test.ts`; `bun test ./scripts` discovers them. They cover the
recorded Foldkit conflict, transitive-minimum drift, warning-only installers,
unpublished cohort rewriting, nested resolution, and configuration isolation.
