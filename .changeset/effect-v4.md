---
"@confect/core": major
"@confect/server": major
"@confect/js": major
"@confect/react": major
"@confect/cli": major
"@confect/test": major
---

Migrate to Effect v4. All `@confect/*` packages now require `effect@^4.0.0-beta.93`; `@effect/platform` and `@effect/cli` are no longer dependencies (their functionality moved into `effect` core and `effect/unstable/*`).

Breaking changes for users:

- **Schemas** follow Effect v4's Schema API: `Schema.Union([a, b])` (array form), `Schema.Literals([...])` for literal unions, `Schema.optionalKey` in place of `optionalWith({ exact: true })`, `Schema.TaggedErrorClass` in place of `Schema.TaggedError`, and checks like `Schema.String.check(Schema.isMaxLength(...))` in place of piped filters.
- **Option-returning functions** must use a codec with a serializable encoded form, such as `Schema.OptionFromNullOr(...)` — v4's `Schema.Option` encodes to an `Option` instance, which is not a Convex value.
- **Table schemas** may now be transformations (`Schema.decodeTo` chains, `Schema.encodeKeys`), branded structs, suspended schemas, or unions of these — Convex's system fields are carried through the whole encoding chain. Schemas that do not resolve to an object shape at every step (such as `Schema.Class`) are rejected with a descriptive error when the table is defined.
- **`@confect/react`**: `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`), and decode failures surface as `SchemaError` rather than `ParseError`.
- **HTTP APIs** are defined with `effect/unstable/httpapi`. Each entry passed to `HttpApi.make` is now built with `HttpApi.mount({ api, apiLive, middleware?, scalar? })`, which checks at compile time that the `apiLive` group handler layers cover every group declared by `api`. `middleware` uses v4's `HttpMiddleware` shape and is applied as global route middleware, so middleware-returned response modifications (e.g. CORS headers) take effect.
- **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
- Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads — `Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call — opt the query out and evict as they honestly should.
