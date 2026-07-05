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
- **`@confect/react`**: `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`), and decode failures surface as `SchemaError` rather than `ParseError`.
- **HTTP APIs** are defined with `effect/unstable/httpapi`. Each mounted API now passes its `HttpApi` definition as `api` alongside the group handler layers as `apiLive`, and `middleware` uses v4's `HttpMiddleware` shape.
- **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
- Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads — `Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call — opt the query out and evict as they honestly should.
