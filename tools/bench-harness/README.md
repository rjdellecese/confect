# confect-bench-harness

Re-exports [`@ark/attest`](https://github.com/arktypeio/arktype/tree/main/ark/attest)'s
`bench` to the type-level benchmarks in `packages/*/test/*.bench.ts`, and exists
only so that `@ark/attest` resolves against TypeScript 6 while the rest of the
workspace runs on TypeScript 7.

TypeScript 7 is the native compiler: `tsc` is a Go binary, and the `typescript`
npm package no longer exports the JavaScript compiler API — `import ts from
"typescript"` yields a version string and nothing else. `@ark/attest` drives
that API (and `tsserver`) to count type instantiations, so it cannot run on
TypeScript 7 at all; there is no released version of it that can.

pnpm resolves a peer dependency from whichever package depends on it, so the
only way to hand `@ark/attest` a different `typescript` than the one the
workspace typechecks with is to move it behind a package that pins its own.
That is all this package is: one re-export, plus the `typescript` pin below it.

Pinning has an incidental benefit worth keeping even once `@ark/attest` learns
to speak to the native compiler: the committed instantiation baselines are
measured against a fixed checker, so a number moving means the library's types
moved, not that the compiler did.

Note that the baselines dropped by roughly 8–15% when this package was
introduced, because `@ark/attest` had until then been counting instantiations
performed by the Effect language service plugin, which the old
`effect-language-service patch` injected into the JavaScript compiler that
`@ark/attest` loaded. The plugin now lives in the native `effect-tsgo` binary,
which `@ark/attest` never touches, so the counts describe Confect's own types.
