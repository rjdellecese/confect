# Experimental native compiler qualification

This private tool qualifies a bounded public-Go esbuild boundary. It is **not a
CLI backend**, a production-parity claim, a readiness certificate, or a benchmark.
Nothing imports it from a published package. The existing compiler, configuration
guards, stabilization/final native sweep, and table versus spec/implementation
partitions are unchanged.

## Run the qualification

From the repository root, with Go 1.27.2, the repository's Node/pnpm versions, and
installed dependencies:

```sh
pnpm build
pnpm --filter confect-native-compiler qualify
pnpm --filter confect-native-compiler test:go
pnpm --filter confect-native-compiler test:go:race
```

`qualify` builds `bin/native-compiler.exe` locally, runs the dedicated Vitest suites,
then checks exact and inexact optional-property types. The executable has the same
filename on Linux and Windows. It is ignored by Git and is not a distributable
artifact. The Go race command is qualified on Linux; Windows runs the normal Go
suite. The dedicated GitHub Actions workflow runs both operating systems, with a
15-minute job deadline. Local verification on Linux does not establish a Windows
pass; that requires the workflow result.

Ordinary package builds and the root Vitest suite do not build Go or discover
these tests. `vitest.config.ts` explicitly discovers per-module unit suites under
`test/*.test.ts` and cross-process integration suites under
`test/integration/*.test.ts`. Root TypeScript and lint checks still cover this
private TypeScript code.

## Ownership and acceptance

`Authority.ts` constructs the real `CompilationInputs` and `CompilationPlugin`.
Node discovers and flattens configuration, supplies `tsconfigRaw` and conditions,
and keeps lexical/canonical configuration and runtime observations authoritative.
For each native resolve callback, the bridge runs the **actual** production
`onResolve` callback. Its `build.resolve` uses the public-Go probe sent with that
callback, not a second Node/esbuild resolution or an approximation of the Node
resolver. An unexpected additional probe or plugin-data result fails explicitly.
The real plugin also normalizes emitted external URLs/paths back to physical
paths. No JavaScript plugin object crosses the protocol.

Go owns the retained public `api.Context`, native resolution probes, file loading,
the finite transformations below, and captures. It imports only
`github.com/evanw/esbuild/pkg/api`; `go.mod` and `go.sum` pin esbuild 0.28.2.
The executable reports the linked dependency version, and the host requires an
exact match with both the protocol expectation and the JavaScript comparator.

`Capture.accept` checks the Node epoch and input-generation guards, hashes the
received bytes, rejects duplicate source identities, verifies metafile input and
output coverage, and runs production external normalization. Source identities
bind path, namespace, suffix, sorted attributes, loader, resolve directory,
loaded-byte SHA-256 and original-byte SHA-256. Go hashes the same contents supplied
to `OnLoad`; it never rereads source files after compilation to manufacture proof.
The fixture compares original digests against authored in-memory fixture values.

The first fixture capture is deliberately rejected when input discovery expands
the Node generation. A subsequent retained rebuild is checked again. This small
qualification consumer does **not** implement or replace `CompilationContext`'s
publication, stabilization, final sweep, evaluation sessions, or watcher
ownership. Even an accepted capture is not a filesystem snapshot or a production
readiness receipt.

## Qualified behavior and limits

| Area                     | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real production plugins  | Integration tests use `CompilationPlugin` and `CompilationSources`, not equivalent toy plugins. They compare complete normalized metafiles, output bytes, source identities, and parser diagnostics under the same finite build profile.                                                                                                                                                     |
| File-scope injection     | TS and JS fixtures match `bundle-require` 5.1.0's injected `__filename`, `__dirname`, and `import.meta.url`. Fresh Node ESM processes execute the emitted bundles and assert those values. Native also implements the production extension family, but JSX/TSX and every extension's syntax are not individually qualified here. Invalid UTF-8 injected code fails explicitly.               |
| Loaders and attributes   | Plain JSON plus `type: json`, `type: text`, and `type: bytes` fallback loads are compared. JSON attributes use the actual production JSON-to-JS transform options and retain original-byte provenance. The same file with different attributes and a suffix variant have distinct observations. As in production, file-scope and generated-file loaders precede fallback attribute handling. |
| Resolution               | Node-flattened tsconfig aliases, custom import conditions, builtins, static/dynamic external imports, and conditional `require` targets use the real Node authority. Retained extensionless imports select a newly created preferred `.ts` file instead of the previous `.js`. Go tests also preserve an explicitly named `.js` entry beside `.ts`.                                          |
| Generated/authored files | Disk-backed owned files use `confect-generated`; authored exceptions remain in `file`. Both are compared with the production plugin. There is no in-memory overlay API.                                                                                                                                                                                                                      |
| Protected source aliases | Lexical `.env.local` imports and symlink aliases fail before native source-content IO and produce no source capture. This is not a defense against concurrent symlink replacement. Native resolver metadata reads, such as a `package.json` symlink, are not intercepted by `OnLoad`; complete resolver-read protection is not claimed.                                                      |
| Diagnostics and output   | Diagnostics preserve ID, plugin name, text, location and notes, without arbitrary `detail`. Native esbuild may clear a plugin-supplied custom diagnostic ID; rejection text remains explicit. Output hashes are checked against delivered bytes, and failed/cancelled builds cannot pass capture acceptance.                                                                                 |
| Cancellation/disposal    | Live native and fake-peer tests exercise callback finalization, cancellation, completion races, recovery, disposal during active work, repeated disposal, close waiting and rejection after closing. Native disposal waits for owned `OnDispose` completion, not just public `Dispose` return.                                                                                               |
| Protocol/process faults  | Unit and race-enabled Go tests cover malformed/truncated/oversized frames, unknown and duplicate fields, duplicate/out-of-order/unexpected IDs, mismatched ownership, capability/version mismatch, process death, callback saturation and output backpressure. Errors never select another backend.                                                                                          |

The private boundary checks the protected basename case-insensitively on every
OS, including when a source path does not exist. This does not change production
loader policy.

### Explicitly unsupported or not qualified

- **Component wrappers are rejected.** Non-entry imports matching
  `convex.config` produce `UnsupportedComponent`. The comparison test invokes
  the real `ConvexConfig.componentConfigPlugin` and proves that its wrapper
  semantics exist; this boundary does not implement them.
- **Unsupported native loaders/namespaces fail.** Data URLs, CSS, custom loader
  maps and arbitrary JavaScript plugins are not supported. Only file and
  `confect-generated` bundled namespaces are accepted.
- **The build profile is intentionally finite.** It uses Node ESM, target node22,
  external sourcemaps, `keepNames`, no splitting, and normal `.js` output names.
  This is not the production profile's numbered `.mjs` entries, inline maps,
  `mainFields: ["main"]`, or shared chunks. Batch graph topology and production
  option/profile coverage need a later layer; no combined tables/specs/impls
  experiment is performed here.
- **Package edge cases are not a completeness claim.** Package imports and
  self-references, wildcard/array exports, PnP, symlink policy, fallback-resolution
  failures, all side-effects combinations, and mixed package formats need wider
  qualification. The real resolver is reused, but these fixtures do not prove
  every path through it. `require.resolve` remains a runtime call in the tested
  emitted ESM and has no corresponding metafile edge; runtime execution of
  require-bearing ESM is not qualified by the import-only execution fixture.
- **Arbitrary uninterruptible host work cannot be forcibly finalized.** The
  production Promise bridge is uninterruptible until its callback settles so a
  cancellation acknowledgment cannot lie about completion. Peer timeouts kill
  the native process, but a permanently hung uninterruptible JavaScript callback
  can still delay its owning scope. No arbitrary user plugins are accepted.
- **Distribution is separate.** Cross-platform packaging, release binaries,
  executable discovery, signing and installation are not implemented. There is
  no fallback when the executable is missing or incompatible.

## Bounds and wire contract

[PROTOCOL.md](./PROTOCOL.md) defines the versioned length-prefixed messages and
ownership rules. Frames are at most 8 MiB, with one context and active build per
process, eight concurrent native loads, 32 outstanding resolver callbacks, three host control requests, and a
16 KiB stderr tail. Native source/capture and outbound-queue limits fail closed
instead of accumulating an unbounded transcript. No watch server is started.

Cancellation requests that lose the race to an already completed build receive
an acknowledgment after its provisional capture; they cannot retract an already
completed result. After `CancelCallbacks`, only a Cancelled capture is valid.
New rebuilds are rejected until cancellation acknowledgment, and no capture may arrive
after cancellation/disposal acknowledgment.

## Dependency-source provenance

The inspected `opensrc` esbuild path identifies 0.28.2. The cached Effect path
labelled 4.0.4 instead contained a 4.0.6 manifest, so it was not treated as the
pinned API. The exact Effect 4.0.4 registry archive was checked against
`pnpm-lock.yaml`'s SHA-512 integrity before inspection. It uses
`Schema.TaggedError` and `effect/process`, not the differently versioned cached
APIs. `bundle-require` has no opensrc repository mapping; its exact 5.1.0 registry
archive was also integrity-checked before porting its injection. No dependency
source under package-manager directories was inspected.

This is private qualification tooling with no published-package surface change,
so it needs no changeset. Passing it authorizes further review of this boundary,
not a production compiler switch or a performance claim.
