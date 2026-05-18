---
"@confect/core": major
"@confect/server": major
"@confect/js": major
"@confect/react": major
"@confect/cli": major
"@confect/test": major
---

Migrate from Effect 3.21 to Effect 4.0.0-beta.67

**Breaking — peer dep**: All packages now require `effect@4.0.0-beta.67`. Old
companion packages (`@effect/platform`, `@effect/platform-node`,
`@effect/cluster`, `@effect/experimental`, `@effect/rpc`, `@effect/sql`,
`@effect/workflow`, `@effect/vitest`) are no longer needed for these packages —
their surface folded into `effect/unstable/*` in v4.

### Key API migrations applied

**Schema:**

- `Schema.Schema<A, I>` (2 generics) → `Schema.Codec<A, I, never, never>` (4
  generics, the latter two for DecodingServices/EncodingServices).
- `Schema.Schema.AnyNoContext` → `Schema.Codec<any, any, never, never>`.
- `Schema.encodedSchema(s).ast` → `Schema.toEncoded(s).ast`;
  `Schema.typeSchema(s)` → `Schema.toType(s)`.
- `Schema.annotations({...})` → `Schema.annotate({...})`.
- `Schema.encode(s)(x)` → `Schema.encodeEffect(s)(x)`;
  `Schema.decode(s)(x)` → `Schema.decodeEffect(s)(x)`.
- `Schema.optionalWith(s, { exact: true })` → `Schema.optionalKey(s)`.
- `Schema.extend(a, b)` removed → `a.pipe(Schema.fieldsAssign(b.fields))`.
- Variadic `Schema.Union(a, b, c)` → array form `Schema.Union([a, b, c])`.
- `Schema.TaggedError` → `Schema.TaggedErrorClass`.
- `ParseResult.ParseError` → `Schema.SchemaError` (and the `ParseResult`
  module is no longer exported from `effect`).

**SchemaAST:**

- `TypeLiteral` → `Objects`, `TupleType` → `Arrays`.
- All `*Keyword` tags collapsed to bare names (`StringKeyword` → `String`,
  `NumberKeyword` → `Number`, etc.).
- `Enums` → `Enum`.
- `SchemaAST.isUndefinedKeyword` → `SchemaAST.isUndefined`.
- Annotation lookup: `SchemaAST.getAnnotation<T>(key)(ast)` (returning
  `Option`) → `Option.fromNullishOr(SchemaAST.resolveAt<T>(key)(ast))`. Note
  that annotation keys must be strings now, not Symbols. The internal
  ConvexId annotation key changed from `Symbol.for("ConvexId")` to
  `"@confect/core/ConvexId"`.

**Effect/Stream/Layer/Result:**

- `Context.GenericTag` → `Context.Service` (and `Effect.Tag` class blocks →
  `Context.Service<Self, Shape>()(name)` two-stage form).
- `Effect.Effect.Success<T>` → `Effect.Success<T>`.
- `Effect.either(eff)` → `Effect.result(eff)`.
- `Effect.catchTag("ParseError", ...)` → `Effect.catchTag("SchemaError", ...)`.
- `Effect.catchAll` removed → `Effect.matchEffect({ onFailure, onSuccess })`.
- `Effect.withClock(clock)` → `Effect.provideService(Clock.Clock, clock)`.
- `Effect.dieMessage` → `Effect.die`.
- `Layer.scoped` → `Layer.effect` (v4 auto-manages Scope).
- `Layer.setConfigProvider(p)` →
  `Layer.succeed(ConfigProvider.ConfigProvider, p)`.
- `Layer.map(layer, f)` → `Layer.effect(tag, Effect.map(Effect.service(oldTag), f)).pipe(Layer.provide(layer))`.
- `Stream.unwrapScoped(eff)` → `Stream.unwrap(eff)` (v4 handles scope in
  the type).
- `Stream.{asyncScoped, async, asyncEffect, asyncPush}` → unified
  `Stream.callback((queue) => Effect)` using `Queue.offerUnsafe(queue, x)`
  and `Queue.failCauseUnsafe(queue, Cause.fail(e))`.
- `Stream.runCollect` now returns `Array<A>` directly (was `Chunk<A>` in v3).
- `Either` module renamed to `Result`; `Either.getOrThrow` →
  `Result.getOrThrow`; `Either.match({onLeft, onRight})` →
  `Result.match({onFailure, onSuccess})`.
- `Option.fromNullable` → `Option.fromNullishOr`.
- `Hash.cached(this, value)` removed → inline `Hash.combine(...)` without
  caching.
- `Order.number` → `Order.Number`.
- `Schema.URL` (was string-accepting in v3) → `Schema.URLFromString` (v4
  `Schema.URL` is `instanceOf<globalThis.URL>`).
- `Ref.unsafeMake` → `Ref.makeUnsafe`.
- `Array.isEmptyReadonlyArray` removed → use `arr.length === 0`.

**ConvexConfigProvider:** rewritten. v3 used `ConfigError` + `ConfigProvider.makeFlat` + `ConfigProviderPathPatch` (all removed in v4). v4's `ConfigProvider.fromEnv({ env })` is much simpler; pass an explicit env snapshot to side-step [effect-smol#2143](https://github.com/Effect-TS/effect-smol/issues/2143) (Convex bundler can't analyze `import.meta.env`).

**HttpApi:** moved to Effect 4's `HttpRouter.toWebHandler` /
`HttpRouter.layer` runtime surface. `HttpApi.make` entries now carry both the
`api` value and `apiLive` layer so Confect can register HTTP API routes and
mount Scalar docs through the typed Effect 4 `HttpApiScalar.layer(api, options)`
shape.

### Notes

- `@confect/cli` is included in the Effect 4 prerelease and uses local Node
  shims for filesystem/path/child-process operations.
- `apps/example` is included and builds against the Effect 4 package outputs.
- Test suites have been swept for Effect 4 runtime and type-test compatibility.
