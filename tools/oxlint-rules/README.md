# Confect Oxlint rules

This private workspace package registers the `confect` JavaScript plugin loaded
by the root `.oxlintrc.json`.

## `no-schema-codec-wrappers`

Use Effect Schema's decoding and encoding functions directly instead of adding
functions that only forward their parameters to a codec. The rule also detects
forwarding wrappers that unwrap a codec result with `Result.getOrThrow`, as well
as stored encoding/decoding functions such as `const decode = Schema.decodeResult(Options)`.

Reported:

```ts
const decodeOptions = (options: Options): Options =>
  Schema.decodeResult(Options)(options).pipe(Result.getOrThrow);
```

Use the API at the call site:

```ts
const options = Schema.decodeResult(Options)(input).pipe(Result.getOrThrow);
```

Store reusable configuration on the schema or codec, not on a particular
encoding or decoding function:

```ts
const Json = Schema.fromJsonString(Schema.Unknown, { space: 2 });
const encoded = Schema.encodeResult(Json)(input).pipe(Result.getOrThrow);
```

The rule checks variable bindings and default exports for stored codec functions.
It also checks standalone helpers and default-export functions: expression-bodied
arrows and functions with a single return.
Each parameter must be forwarded unchanged exactly once. It resolves real
imports from `effect` and its `Schema`, `Result`, and `Function` subpaths,
including renamed imports and immutable aliases; shadowed names and unrelated
libraries are not treated as Effect APIs.

Functions that transform inputs, select schemas from their inputs, map results
or errors, branch, or execute additional statements are allowed. Defaults,
destructuring, rest parameters, type assertions, async functions, generators,
and zero-argument lazy thunks are outside this rule's scope. Inline callbacks and
object methods are also excluded: their enclosing API can require an adapter.
For example, an array callback receives an index as its second argument, whereas
a Schema codec accepts parse options there; passing the codec directly is not
necessarily type-compatible or behavior-preserving.
Inline codec use in combinators is allowed, as is schema construction with
`Options.make(input)` when its constructor semantics are appropriate.

`packages/server/test/Document.bench.ts` has a narrow configuration exception:
its cached-codec benchmarks must retain stored functions to measure the intended
comparison. The benchmark cases and baselines are unchanged.

There is deliberately no autofix. Moving codec construction out of a function
can change when a schema is evaluated, and removing `Result.getOrThrow` changes
the return and error contracts. Keep schema construction at its existing
evaluation boundary when replacing a wrapper.

Run the plugin's tests with:

```sh
pnpm exec vitest run --project confect-oxlint-rules
```
