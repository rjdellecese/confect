---
"@confect/core": major
"@confect/server": major
"@confect/js": major
"@confect/react": major
"@confect/cli": major
"@confect/test": major
---

Migrate to Effect v4. All `@confect/*` packages now require `effect@^4.0.0-beta.97`; `@effect/platform` and `@effect/cli` are no longer dependencies (their functionality moved into `effect` core and `effect/unstable/*`).

Breaking changes for users:

- **Schemas** follow Effect v4's Schema API: `Schema.Union([a, b])` (array form), `Schema.Literals([...])` for literal unions, `Schema.optionalKey` in place of `optionalWith({ exact: true })`, `Schema.TaggedErrorClass` in place of `Schema.TaggedError`, and checks like `Schema.String.check(Schema.isMaxLength(...))` in place of piped filters.
- **Option-returning functions** must use a codec with a serializable encoded form, such as `Schema.OptionFromNullOr(...)` — v4's `Schema.Option` encodes to an `Option` instance, which is not a Convex value.
- **Table schemas** may now be transformations (`Schema.decodeTo` chains, `Schema.encodeKeys`), branded structs, suspended schemas, or unions of these — Convex's system fields are carried through the whole encoding chain. Schemas that do not resolve to an object shape at every step (such as `Schema.Class`) are rejected with a descriptive error when the table is defined.
- **Clients**: decode failures surface as `SchemaError` rather than `ParseError` in `@confect/js` and `@confect/react`, and `@confect/react`'s `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`).
- **HTTP** is now mounted through the renamed `HttpRouter` module (formerly `HttpApi`). `HttpRouter.make(routes)` takes a single route-registering `Layer` composed from Effect's own `effect/unstable/http` and `effect/unstable/httpapi` modules — `HttpApiBuilder.layer(api)` (with group handler layers supplied via `Layer.provide`; a missing group is a compile-time error), `HttpApiScalar.layer` for docs, `HttpRouter.add` for plain routes, and `HttpRouter.middleware(fn, { global: true })` for middleware, merged with `Layer.mergeAll`. The per-path-prefix record and its `api`/`apiLive`/`middleware`/`scalar` options are gone; Confect registers one catch-all Convex HTTP action at `/`, and plain Convex routes added to the returned router still take precedence. Handlers, middleware, and route-layer construction all run with Confect's Convex-aware `ConfigProvider` in context.
- **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
- **Configuration**: Confect's Convex-aware `ConfigProvider` treats empty-string environment variables as missing values (matching Effect v4's built-in providers), so `Config.withDefault` and `Config.option` recover from them.
- **CLI**: a malformed `convex.json` now fails codegen with a descriptive error instead of being silently ignored.
- Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads — `Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call — opt the query out and evict as they honestly should.
