# Toolchain performance: TypeScript Go to tsrs

Measured on November 4, 2026. The migration makes full workspace typechecking
**4.26× faster** and linting **1.98× faster** on this machine. Compiler memory
falls substantially, but lint memory increases: this is not a universal memory
improvement.

## Before and after

Medians of five measured runs after one discarded warmup per workload:

| Workload                                |  Before |   After | Speedup | Before peak RSS | After peak RSS |
| --------------------------------------- | ------: | ------: | ------: | --------------: | -------------: |
| Forced project graph and type contracts | 16.83 s |  3.95 s |   4.26× |       2,251 MiB |        590 MiB |
| No-change incremental `pnpm typecheck`  |  0.61 s |  0.40 s |   1.53× |         115 MiB |         58 MiB |
| `pnpm lint`                             | 31.09 s | 15.68 s |   1.98× |       1,468 MiB |      2,006 MiB |

Full graph checking takes 76.5% less time and 73.8% less peak RSS. Lint takes
49.6% less time but uses **36.7% more peak RSS**. RSS is GNU time's maximum
process resident set, not the sum of concurrently resident child processes.
The incremental row measures a no-op, not the response to an edited file.

The baseline is commit `894066f26c1495816e17d4c6c47bb89dcb3e5c3b`, with
TypeScript 7.0.2, `@effect/tsgo` 0.44.0, Oxlint 1.82.0, and oxlint-tsgolint
7.0.2001. The migrated stack uses tsrs 0.21.0-ts7.1.0-beta,
`@effect/tsgo` 0.67.1, and Oxlint 1.91.0 with the Rust type-aware backend.
These are whole-toolchain gains, including upstream compiler and lint updates,
not an isolated claim about Rust versus Go.

An initial implementation launched every compiler command through
`effect-tsgo tsrs`. Its no-change check took 1.24 s. Workspace commands now
launch the installed, Effect-patched `tsrs` directly, avoiding redundant proxy
startup while keeping the same compiler and diagnostics configuration.

## Matched compiler comparison

To separate the TypeScript-version upgrade from the compiler implementation,
the same migrated tree was also checked with TypeScript 7.1.0-beta and tsrs's
7.1.0-beta frontend, both provided by `@effect/tsgo` 0.67.1. Both used the proxy
launcher, the same forced-graph command, and default worker settings. The order
alternated between Go-first and Rust-first for each paired run.

| Compiler                     | Median time | Median peak RSS |
| ---------------------------- | ----------: | --------------: |
| `effect-tsgo tsc@7.1.0-beta` |     11.96 s |       1,333 MiB |
| `effect-tsgo tsrs`           |      4.87 s |         590 MiB |

On this matched frontend and plugin version, Rust is **2.46× faster** and uses
55.7% less peak RSS. This comparison retains identical launcher overhead;
the final workspace commands avoid it.

## Reproduce the measurements

The host was an isolated Ubuntu 24.04 Linux x86-64 VM with two logical AMD EPYC
CPUs and 8 GiB RAM, running Node 24.22.1, pnpm 12.16.1, and Bun 1.4.4. No test
suites, builds, or development watchers ran concurrently with the measurements.
Runs used warm filesystem caches; no disk-cache flushing or machine-wide
cache clearing was performed.

Install and build first. Run each workload six times sequentially, discard the
first run, and take the median of the other five. Use
`/usr/bin/time -f '%e %M'` around the entire shell command to collect elapsed
seconds and maximum RSS in KiB. Keep every exit status zero.

The forced workload is:

```sh
pnpm exec tsrs -b tsconfig.packages.json tsconfig.json tools/oxlint-rules/tsconfig.json --force && pnpm exec tsrs -p tools/test-types/tsconfig.json
```

Use `pnpm exec tsc` for the original baseline. For the matched comparison, use
`pnpm exec effect-tsgo tsc@7.1.0-beta` and `pnpm exec effect-tsgo tsrs` in place
of `pnpm exec tsrs`. `--force` bypasses incremental build reuse and exercises
declaration emission as well as source and test checking; it does not bypass
the operating system's file cache.

After warming the corresponding compiler's build state, measure
`pnpm typecheck` without editing a file. Measure `pnpm lint` separately; it
includes Syncpack and the repository's actual lint configuration. The migrated
lint preset has additional upstream rules, so that row is not a rule-for-rule
engine microbenchmark. No application runtime speedup is claimed.

### Recorded samples

Each cell lists the five measured runs, excluding warmup, in execution order.

| Stack and workload   | Seconds                           | Peak RSS, KiB                               |
| -------------------- | --------------------------------- | ------------------------------------------- |
| Before, forced graph | 16.81, 16.83, 17.23, 16.96, 16.01 | 2305424, 2329956, 2159320, 2181972, 2320032 |
| After, forced graph  | 4.21, 4.50, 3.93, 3.95, 3.81      | 602028, 609108, 607116, 604396, 601336      |
| Before, incremental  | 0.61, 0.69, 0.58, 0.66, 0.59      | 118180, 117752, 117888, 118076, 118396      |
| After, incremental   | 0.40, 0.42, 0.39, 0.43, 0.37      | 60844, 60748, 59468, 59316, 59296           |
| Before, lint         | 34.57, 33.96, 31.09, 30.25, 30.83 | 1526768, 1432536, 1832008, 1502904, 1491180 |
| After, lint          | 14.85, 15.68, 15.52, 17.27, 17.99 | 2054300, 2055680, 2047668, 2044596, 2068816 |
| Matched Go 7.1       | 13.77, 12.09, 11.96, 11.93, 11.25 | 1345464, 1365484, 1343536, 1428960, 1478168 |
| Matched Rust 7.1     | 5.33, 5.02, 4.65, 4.87, 4.63      | 604516, 601092, 606684, 602940, 610916      |

## Integration decisions

The install lifecycle patches only tsrs. Compiler scripts, Vitest's type tests,
and attest's native API and counting subprocesses use that patched binary.
Oxlint and Vite+ use `effect-tsgo --tsrs-lint` instead of mutating their installed
packages. Zed launches both language servers with Bun: the Node proxy's
`execve` path left stdin nonblocking during a live LSP probe, causing tsrs to
exit with `Resource temporarily unavailable`. Both configured Bun launchers
returned initialization capabilities and remained alive after idle.

The newer Effect recommended preset drops several Effect-native rules. Their
previous severities are explicit in `.oxlintrc.json`; `global-json-in-effect`
replaces the deprecated `prefer-schema-over-json` with the same coverage.
New brand, unstable-API, match-rewrite, and catch-handler policies are deferred
to avoid changing library semantics during a compiler migration. The new
empty-object lint rejects intentional `ThisType` and empty-argument contracts,
so it is disabled. The HTTP-client test's Promise-returning fetch stub is an
external callback boundary, so its nested-runtime warning has a file-scoped
exception. Existing test assertions and runtime benchmark baselines are intact.

Convex 1.49.0's embedded checker accepts only `tsc` or `tsgo`. The example uses
an explicit Rust watch process instead; it reports errors but does not block
Convex hot pushes. Codegen runs a blocking Rust check after generation, and
the dedicated example typecheck and CI gates remain blocking.

The native instantiation-count baselines are a separate measurement with a
different counting algorithm. See [the harness README](README.md); their
changes are not included in the speedup claims above.
