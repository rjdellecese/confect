# @confect/test

## 10.1.0

No changes in this release.

## 10.0.0

### Major Changes

- c05ae0b: Migrate Confect to Effect 4, add middleware, experimental composable query streams, Foldkit bindings, and Convex AI gateway integrations. This release requires changes to function argument declarations, HTTP routers, runner calls, and test setup when upgrading from v9.

  ### Requirements
  - All Confect packages require Node.js 24 or later and `effect ^4.0.0`.
  - `@confect/server` requires `convex ^1.45.0`.
  - `@confect/server`'s optional `@effect/platform-node` peer requires `^4.0.0` for Node actions.
  - The new `@confect/foldkit` package requires `foldkit ^0.165.0`.

  Confect no longer depends on `@effect/platform` or `@effect/cli`. Run `confect codegen` to regenerate the v10 bindings after updating your Confect declarations.

  ### Breaking changes

  #### Declare function arguments as lazy field maps

  Pass a callback returning the fields of an argument object, rather than a callback returning `Schema.Struct`. This applies to queries, mutations, actions, and paginated queries. You can omit `args` when a function takes no arguments; Confect supplies an empty object. Keep `returns`, `item`, and `error` as callbacks returning schemas.

  **Before:**

  ```ts
  import { FunctionSpec } from "@confect/core";
  import * as Schema from "effect/Schema";

  FunctionSpec.publicQuery({
    name: "greet",
    args: () => Schema.Struct({ name: Schema.String }),
    returns: () => Schema.String,
  });
  ```

  **After:**

  ```ts
  import { FunctionSpec } from "@confect/core";
  import * as Schema from "effect/Schema";

  FunctionSpec.publicQuery({
    name: "greet",
    args: () => ({ name: Schema.String }),
    returns: () => Schema.String,
  });
  ```

  #### Keep table declarations client-safe

  Import `Table` from `@confect/core` in your table declarations. Specs can then return a generated table's `Doc` without pulling server code into the client. `confect codegen` rejects value imports of `@confect/server` anywhere reachable from a spec, including table and generated modules. Type-only imports remain allowed.

  **Before:**

  ```ts
  import { Table } from "@confect/server";
  import * as Schema from "effect/Schema";

  export default Table.make(() => Schema.Struct({ text: Schema.String }));
  ```

  **After:**

  ```ts
  import { Table } from "@confect/core";
  import * as Schema from "effect/Schema";

  export default Table.make(() => Schema.Struct({ text: Schema.String }));
  ```

  Table declarations still return a schema, not the field maps now used by function arguments. The server's `Table` re-exports remain available for server-only use. Run `confect codegen` to regenerate the deploy schema and client-safe table bindings.

  #### Use serializable schemas and handle updated errors

  Confect function schemas must encode to Convex values. Use a serializable codec such as `Schema.OptionFromNullOr(...)` for an `Option` crossing that boundary: `Schema.Option` no longer provides the serialized representation expected there.

  Table schemas support object-shaped transformations, encoded-key mappings, brands, suspended schemas, and unions of those schemas while retaining Convex system fields. Every step must remain object-shaped; class schemas such as `Schema.Class` are not valid table schemas.

  Decode failures now use `Schema.SchemaError` instead of `ParseError`, including JavaScript clients, React hooks, and test helpers. React `useMutation` and `useAction` calls with declared errors return Effect `Result` values instead of `Either` values. Update matching and error annotations accordingly.

  #### Replace HTTP API mounts with route layers

  Replace Confect's `HttpApi.make` with `HttpRouter.make`. The old record of path prefixes and `apiLive`, `middleware`, and `scalar` options is replaced by one layer registering all routes. Build API routes with Effect's `HttpApiBuilder.layer`, provide each group's handlers, and add Scalar documentation explicitly.

  For an API named `Api` and its group handler layer `ApiLive`:

  **Before:**

  ```ts
  import { HttpApi as ConfectHttpApi } from "@confect/server";
  import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
  import * as Layer from "effect/Layer";

  export default ConfectHttpApi.make({
    "/api/": {
      apiLive: HttpApiBuilder.api(Api).pipe(Layer.provide(ApiLive)),
    },
  });
  ```

  **After:**

  ```ts
  import { HttpRouter as ConfectHttpRouter } from "@confect/server";
  import * as Layer from "effect/Layer";
  import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
  import * as HttpApiScalar from "effect/http-api/HttpApiScalar";

  export default ConfectHttpRouter.make(
    Layer.mergeAll(
      HttpApiBuilder.layer(Api).pipe(Layer.provide(ApiLive)),
      HttpApiScalar.layer(Api, { path: "/api/docs" }),
    ),
  );
  ```

  Put the endpoint prefix on the Effect API itself, for example with `.prefix("/api")`. For interactive documentation, configure Scalar's `baseServerURL` with your deployment's site URL. Missing API handler groups are compile-time errors. You can merge plain routes from `effect/http/HttpRouter.add` and global middleware from `HttpRouter.middleware` into the same layer.

  The returned Convex router serves Effect routes through a catch-all at `/`; plain Convex routes added to it still take precedence. Route-layer construction, handlers, and middleware can read Convex environment variables through Confect's configuration provider.

  #### Call named runner methods

  `QueryRunner`, `MutationRunner`, and `ActionRunner` are no longer callable services. Destructure `runQuery`, `runMutation`, or `runAction` instead.

  **Before:**

  ```ts
  import * as Effect from "effect/Effect";

  const firstNote = Effect.gen(function* () {
    const runQuery = yield* QueryRunner;
    return yield* runQuery(refs.public.notes.getFirst, {});
  });
  ```

  **After:**

  ```ts
  import * as Effect from "effect/Effect";

  const firstNote = Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    return yield* runQuery(refs.public.notes.getFirst, {});
  });
  ```

  Runner availability is unchanged. Inside queries or mutations, `runQuery` also accepts a third argument such as `{ transactionLimits: { documentsRead: 100 } }`. Inside mutations, `runMutation` accepts limits such as `{ transactionLimits: { documentsWritten: 10 } }`, and `runQuery` can request `useStaleSnapshot`. Supplying `useStaleSnapshot` requires a mutation context even when it is `false`. Actions and HTTP handlers use runners without transaction options; `runAction` has no options argument.

  #### Yield upload URL generation directly

  `StorageWriter.generateUploadUrl` is an Effect value instead of a zero-argument function.

  **Before:**

  ```ts
  import * as Effect from "effect/Effect";

  const uploadUrl = Effect.gen(function* () {
    const storage = yield* StorageWriter;
    return yield* storage.generateUploadUrl();
  });
  ```

  **After:**

  ```ts
  import * as Effect from "effect/Effect";

  const uploadUrl = Effect.gen(function* () {
    const storage = yield* StorageWriter;
    return yield* storage.generateUploadUrl;
  });
  ```

  Methods that take arguments, such as `delete(storageId)`, remain functions.

  #### Provide test layers without an extra call

  `TestConfect.layer(schema, convexSchema, modules)` now returns a layer directly instead of a function returning that layer. For a project that exports the result as `TestConfect.layer`:

  **Before:**

  ```ts
  const test = testEffect.pipe(Effect.provide(TestConfect.layer()));
  ```

  **After:**

  ```ts
  const test = testEffect.pipe(Effect.provide(TestConfect.layer));
  ```

  Each separate provision still creates a fresh test database.

  #### Update handwritten container annotations

  Read assembled groups with `Spec.groups(spec)` instead of `spec.groups`, and tables with `DatabaseSchema.tables(schema)` instead of `schema.tables`. Explicit `Spec.Spec`, `DatabaseSchema.DatabaseSchema`, and `DataModel.DataModel` annotations now take a record keyed by name rather than a union of members.

  **Before:**

  ```ts
  type AppSpec = Spec.Spec<typeof notesGroup>;
  type AppSchema = DatabaseSchema.DatabaseSchema<typeof notesTable>;
  type AppDataModel = DataModel.DataModel<typeof notesTable>;
  ```

  **After:**

  ```ts
  type AppSpec = Spec.Spec<{ readonly notes: typeof notesGroup }>;
  type AppSchema = DatabaseSchema.DatabaseSchema<{
    readonly notes: typeof notesTable;
  }>;
  type AppDataModel = DataModel.DataModel<{
    readonly notes: typeof notesTable;
  }>;
  ```

  Ordinary builder calls are unchanged, and `DataModel.FromTables` still accepts a table union. Adding a group under an existing name replaces both its value and its inferred type. Run `confect codegen` rather than editing generated annotations.

  #### Review configuration and time-dependent queries

  Confect's configuration provider now treats empty-string environment variables as missing values, so `Config.withDefault` and `Config.option` recover from them.

  Raw `Date.now()` calls in queries now observe time and invalidate Convex's query cache instead of returning v9's globally stubbed value. Explicit Effect clock reads such as `Clock.currentTimeMillis` and `Clock.currentTimeNanos` continue to opt into time tracking. Effect's internal timestamps for logging and tracing do not invalidate the cache.

  ### Middleware with typed services and errors

  Add reusable policies in `confect/middleware/`, with a client-safe `<Name>.spec.ts` and a server-side `<Name>.impl.ts`. This directory is reserved and can no longer contain ordinary function groups.

  Declare a policy with `MiddlewareSpec.MiddlewareSpec`, including its provided services, error schema, and explicit query/mutation/action coverage. Attach it with `.middleware(Policy)` on a group or individual function, or declare an `options` schema and use `.middleware(Policy, options)`. Options are validated without coercion and must be client-safe because generated refs carry them.

  Implement policies with `MiddlewareImpl.make`, `MiddlewareImpl.makeByFunctionType`, or `MiddlewareImpl.provides`, then supply the implementation to the group layer. Callbacks receive `{ invocation }`, plus `options` when declared. Policies run after argument decoding, with group policies before function policies, and can supply services to later policies and handlers. Typed policy failures reach clients alongside function errors and short-circuit the remaining chain.

  The same policy can run more than once with different options; equivalent attachments are rejected. Coverage and service dependencies are checked, missing implementations fail codegen, middleware does not propagate to subgroups, and plain Convex functions cannot have Confect middleware attached.

  ### Experimental composable query streams

  Use `reader.table(...).stream(index, range?, order?)` and `QueryStream` from `@confect/server` to merge, filter, map, join, deduplicate, narrow, and reverse indexed queries while retaining cursor pagination. Ordering compatibility is checked, joins can provide left-join placeholders, effectful filters and maps support ordered concurrency, and reversing a distinct stream preserves its selected representatives.

  ```ts
  import { QueryStream } from "@confect/server";
  import * as Effect from "effect/Effect";

  const firstPage = Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const stream = reader.table("notes").stream("by_creation_time");
    return yield* QueryStream.paginate(stream, {
      cursor: null,
      numItems: 20,
      maximumRowsRead: 1000,
    });
  });
  ```

  Read budgets count underlying reads, including documents filtered out of the result; byte budgets are estimates. Invalid page sizes and read limits are rejected before reads. If a budget prevents safe progress or splitting, pagination fails rather than skipping results. Increase the budget or reduce the query's read requirements.

  Use React's new `useStreamPaginatedQuery` for stream-backed paginated queries. It pins loaded page ranges, handles page splits, and restarts on invalid cursors. Foldkit pagination also preserves page ranges during navigation. Ordinary paginated queries and `usePaginatedQuery` remain available.

  All `QueryStream` APIs are experimental. Treat cursors as opaque continuation values, but do not treat them as confidential: they expose order-key values. Avoid public pagination over sensitive indexed fields unless those fields are fixed with `eq`.

  ### Foldkit client bindings

  Add `@confect/foldkit` for Foldkit applications. `Client.layer` provides the scoped client; `Command.query`, `Command.mutation`, and `Command.action` turn Confect calls into commands with declared messages and required success/error handlers. The factories support Foldkit interruption, and the corresponding `queryEffect`, `mutationEffect`, and `actionEffect` helpers support handwritten command definitions.

  `Subscription.reactiveQuery` follows optional arguments derived from your model and manages the live query subscription. `PaginatedQuery` and `Subscription.paginatedQuery` provide reactive next/previous-page navigation, preserve the last complete page while refreshing, ignore superseded settlements, and recover from invalid cursors. Failed refreshes retain stale data, and typed function errors remain available to your message handlers.

  ### Convex AI gateway models

  Use `AiGatewayLanguageClient` and `AiGatewayLanguageModel` to call language models through the Convex AI gateway from actions without supplying provider API keys. Use `AiGatewayDecisionClient` and `AiGatewayDecisionModel` with Effect's `DecisionModel` to classify inputs, apply rubrics, and estimate probabilities.

  ```ts
  import {
    AiGatewayLanguageClient,
    AiGatewayLanguageModel,
  } from "@confect/server";
  import * as Layer from "effect/Layer";
  import * as FetchHttpClient from "effect/http/FetchHttpClient";

  const Claude = AiGatewayLanguageModel.model(
    "anthropic/claude-sonnet-4.5",
  ).pipe(
    Layer.provide(AiGatewayLanguageClient.layer),
    Layer.provide(FetchHttpClient.layer),
  );
  ```

  Provide the model to Effect AI operations from `effect/ai`. Disabled or unavailable gateways report typed errors during client construction. Both gateway clients obtain current service credentials before each request, including when reused in long-running actions.

  ### Storage, metadata, logging, and authentication
  - Use the unified generated `Storage` service for download URLs, upload URLs, deletion, blob reads, and blob writes. Each operation retains its context restrictions; the existing storage services remain supported.
  - Cancel scheduled functions with `Scheduler.cancel(id)`, using the ID returned by `runAfter` or `runAt`.
  - Read function and deployment information with `ExecutionMetadata`, request information with `RequestMetadata`, and transaction metrics with `TransactionMetadata`. Generated services expose them only in the contexts that support each capability.
  - `Effect.log*` output uses matching Convex severities in functions and HTTP routes while preserving Effect metadata and custom loggers. `ConvexLogger` is available for explicit configuration, and logs remain associated with the current invocation when Node actions reuse a process.
  - JavaScript `WebSocketClient` and Foldkit `Client` authentication callbacks can require Effect services. Supply them when running `setAuth` and keep scoped dependencies alive while authentication is registered; later token refreshes use the supplied services.
  - JavaScript clients support per-module imports such as `@confect/js/WebSocketClient` and `@confect/js/HttpClient`; root imports are unchanged.

  ### Fixes and diagnostics
  - Preserve precise function error types when `exactOptionalPropertyTypes` is disabled, rather than widening functions without declared errors to `any`.
  - Exclude `_id` and `_creationTime` from patch value types derived from full documents.
  - Preserve `ConvexError.data` when a handler throws a `ConvexError` inside an Effect.
  - Reject non-finite values in Confect's schemas for system timestamps, stored file sizes, and pagination options. User-authored `Schema.Number` fields can still represent Convex's non-finite numbers.
  - Keep queries, mutations, and module initialization compatible with Convex's timer restrictions during long Effect computations.
  - Fail codegen with a descriptive error for malformed `convex.json` instead of silently ignoring it.
  - Add tracing spans for client calls, server functions, database writes and pagination, stream consumers, and code-generation passes.

## 10.0.0-next.27

### Minor Changes

- 6424f03: Require stable `effect@^4.0.0` and matching Effect platform and AI provider packages. `@confect/foldkit` now requires `foldkit@^0.165.0`, which supports Effect 4.0.0 without a peer-dependency override.

## 10.0.0-next.26

No changes in this release.

## 10.0.0-next.25

### Patch Changes

- f9958b9: Require `effect@^4.0.0-rc.118` and matching Effect platform packages. Upgrade Effect alongside Confect and replace `effect/unstable/*` imports with `effect/*`, using `effect/http-api` for HTTP API imports.

## 10.0.0-next.24

### Patch Changes

- 850a3c3: Require `effect@^4.0.0-rc.117` across `@confect/*` and `@effect/platform-node@^4.0.0-rc.117` for `@confect/server`'s optional Node integration. Upgrade these dependencies alongside Confect; existing Confect call sites are unchanged.

## 10.0.0-next.23

No changes in this release.

## 10.0.0-next.22

### Patch Changes

- 9f4e2c0: Require `effect@^4.0.0-rc.113` across `@confect/*` and raise `@confect/server`'s optional `@effect/platform-node` peer to the same range. Upgrade Effect alongside Confect; existing Confect call sites are unchanged.

  Effect's own APIs include breaking renames: use `Config.String` instead of `Config.string`, and `LanguageModel.LanguageModel` instead of `LanguageModel.Service` when annotating the result of `AiGatewayLanguageModel.make`. See the [Effect RC 113 release notes](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.113) for the complete migration guidance.

- 90c80e9: Require `effect@^4.0.0-rc.115` across `@confect/*` and `@effect/platform-node@^4.0.0-rc.115` when using `@confect/server`'s optional Node integration. Upgrade these dependencies alongside Confect; existing Confect call sites are unchanged.

## 10.0.0-next.21

### Major Changes

- a6425c5: Raise the minimum supported Node.js version to 24.

  ### Breaking Changes
  - `engines.node` is now `>=24` on every `@confect/*` package, raised from `>=22`.

  Node 22 has entered maintenance, so Confect now targets Node 24, the active LTS line. To migrate, move the Node version your project builds and runs on to 24 or later—on Node 22, installing `@confect/*` now fails your package manager's engine check. No API changes accompany the raise: code already running on Node 24 needs no edits.

## 10.0.0-next.20

## 10.0.0-next.19

## 10.0.0-next.18

## 10.0.0-next.17

### Patch Changes

- 8e4962e: Raise the required `effect` peer version to `^4.0.0-rc.111` (from `^4.0.0-rc.110`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  No Confect API changed, and no call-site edits are needed. `rc.111` is a patch release of Effect with nothing removed or renamed, so upgrading is a matter of installing it alongside `@confect/*`.

## 10.0.0-next.16

### Major Changes

- Migrate to Effect v4. All `@confect/*` packages now require `effect@^4.0.0-beta.97`; `@effect/platform` and `@effect/cli` are no longer dependencies (their functionality moved into `effect` core and `effect/unstable/*`).

  Breaking changes for users:

  - **Schemas** follow Effect v4's Schema API: `Schema.Union([a, b])` (array form), `Schema.Literals([...])` for literal unions, `Schema.optionalKey` in place of `optionalWith({ exact: true })`, and checks like `Schema.String.check(Schema.isMaxLength(...))` in place of piped filters.
  - **Option-returning functions** must use a codec with a serializable encoded form, such as `Schema.OptionFromNullOr(...)`—v4's `Schema.Option` encodes to an `Option` instance, which is not a Convex value.
  - **Table schemas** may now be transformations (`Schema.decodeTo` chains, `Schema.encodeKeys`), branded structs, suspended schemas, or unions of these—Convex's system fields are carried through the whole encoding chain. Schemas that do not resolve to an object shape at every step (such as `Schema.Class`) are rejected with a descriptive error when the table is defined.
  - **Clients**: decode failures surface as `SchemaError` rather than `ParseError` in `@confect/js` and `@confect/react`, and `@confect/react`'s `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`).
  - **HTTP** is now mounted through the renamed `HttpRouter` module (formerly `HttpApi`). `HttpRouter.make(routes)` takes a single route-registering `Layer` composed from Effect's own `effect/unstable/http` and `effect/unstable/httpapi` modules—`HttpApiBuilder.layer(api)` (with group handler layers supplied via `Layer.provide`; a missing group is a compile-time error), `HttpApiScalar.layer` for docs, `HttpRouter.add` for plain routes, and `HttpRouter.middleware(fn, { global: true })` for middleware, merged with `Layer.mergeAll`. The per-path-prefix record and its `api`/`apiLive`/`middleware`/`scalar` options are gone; Confect registers one catch-all Convex HTTP action at `/`, and plain Convex routes added to the returned router still take precedence. Handlers, middleware, and route-layer construction all run with Confect's Convex-aware `ConfigProvider` in context.
  - **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
  - **Configuration**: Confect's Convex-aware `ConfigProvider` treats empty-string environment variables as missing values (matching Effect v4's built-in providers), so `Config.withDefault` and `Config.option` recover from them.
  - **CLI**: a malformed `convex.json` now fails codegen with a descriptive error instead of being silently ignored.
  - Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads—`Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call—opt the query out and evict as they honestly should.

- `TestConfect.layer` now returns a `Layer` directly rather than a function returning one. Drop the trailing call.

  Before:

  ```ts
  export const layer = TestConfect_.layer(
    confectSchema,
    convexSchema,
    import.meta.glob("./convex/**/!(*.*.*)*.*s"),
  );

  // …then, per test:
  Effect.gen(function* () {
    // …
  }).pipe(Effect.provide(TestConfect.layer()));
  ```

  After:

  ```ts
  export const layer = TestConfect_.layer(
    confectSchema,
    convexSchema,
    import.meta.glob("./convex/**/!(*.*.*)*.*s"),
  );

  // …then, per test:
  Effect.gen(function* () {
    // …
  }).pipe(Effect.provide(TestConfect.layer));
  ```

  Each test still gets its own database. The layer is built once per `Effect.provide`, so providing the same value to several tests constructs a fresh test instance for each—the same isolation the extra call used to provide.

### Patch Changes

- Raise the required `effect` peer version to `^4.0.0-beta.100` (from `^4.0.0-beta.99`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.100` release only touches `Cron` internals (month/weekday alias normalization, day/weekday rollover, and equality/hashing), CLI error message formatting (`InvalidValue` prefixes), and `Schema.toTaggedUnion` discriminants that Confect doesn't use.

- Raise the required `effect` peer version to `^4.0.0-beta.101` (from `^4.0.0-beta.100`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.101` release only touches fiber/concurrency internals (interrupt handling in concurrent traversal, stack frame annotations, `awaitAllChildren` linearization, `interruptibleMask` interrupt delivery), a `MutableList.filter` fix for empty buckets, a `Schema.Struct` required-readonly-field type display simplification, and an `HttpRouter.toWebHandler` middleware type-inference tightening that Confect doesn't need to accommodate.

- Raise the required `effect` peer version to `^4.0.0-beta.102` (from `^4.0.0-beta.101`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.
- Raise the required `effect` peer version to `^4.0.0-beta.105` (from `^4.0.0-beta.102`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.103` separates wall-clock time from monotonic elapsed time: `Clock.Clock` now also requires `monotonicTimeNanos` and `monotonicTimeNanosUnsafe`, so a custom `Clock` provided to a Confect function has to supply both. Effects that measure elapsed time—`Effect.timed`, duration metrics, `Sink.withDuration`—read the monotonic accessors instead of the wall clock, and continue to report a zero duration inside queries and mutations, where Confect pins the unsafe accessors to constants to keep Convex's query cache from evicting on every logged span.

  `beta.103` also moves synchronous Effect runs off `setImmediate`/`setTimeout` and onto the microtask queue, which Convex's query and mutation isolate permits. Confect no longer suppresses cooperative fiber yielding for the synchronous work it performs while your modules load—registration and schema-to-validator compilation—and relies on that scheduling instead. Neither the "Can't use `setTimeout` in queries and mutations" crash nor any other consumer-visible behavior changes, but this is the area to look at if module loading starts misbehaving.

  `beta.104` renames Effect's schema error constructors to match their `Data` counterparts, which affects any error schema you declare for a Confect function:

  **Before:**

  ```ts
  export class NoteNotFound extends Schema.TaggedErrorClass<NoteNotFound>()(
    "NoteNotFound",
    { noteId: Id("notes") },
  ) {}
  ```

  **After:**

  ```ts
  export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
    "NoteNotFound",
    { noteId: Id("notes") },
  ) {}
  ```

  `Schema.ErrorClass` is likewise now `Schema.Error`; the schema for JavaScript `Error` instances that previously went by `Schema.Error` is now `Schema.ErrorInstance`, and `Schema.ErrorReviver` is now `Schema.ErrorInstanceReviver`. Confect's own error types—`DocumentDecodeError`, `BlobNotFoundError`, and the rest—are unchanged in name, shape, and message.

  `beta.105` restructures how schema validation failures are reported, but not on the path Confect puts you on: decode and encode failures still surface as `Schema.SchemaError` with a formatted `message`, so error text from `@confect/js`, `@confect/react`, and document decoding is unchanged.

- Raise the required `effect` peer version to `^4.0.0-beta.106` (from `^4.0.0-beta.105`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.106` is a patch-only Effect release. Nothing in Confect's own API changes, and your table, argument, and returns schemas still compile to the same Convex validators.

  One Effect change needs a call-site edit if you derive property-test generators from those schemas: `Schema.toArbitrary` now returns a factory that takes the `fast-check` module instead of returning an arbitrary directly, and `Schema.toArbitraryLazy` and the `{ report: true }` option are gone.

  **Before:**

  ```ts
  const NoteArbitrary = Schema.toArbitrary(Note);
  ```

  **After:**

  ```ts
  import * as FastCheck from "fast-check";

  const NoteArbitrary = Schema.toArbitrary(Note)(FastCheck);
  ```

  HTTP actions written against `HttpRouter` also inherit Effect's stricter multipart handling: a request that exceeds the configured part count, part size, or field size limits now stops being parsed at the limit rather than being read to completion first.

- Raise the required `effect` peer version to `^4.0.0-beta.107` (from `^4.0.0-beta.106`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.107` is a patch-only Effect release, so no Confect API changes and no call-site edits are needed—upgrade `effect` alongside `@confect/*` and everything you have written keeps compiling. Your table, argument, and returns schemas still produce the same Convex validators.

  Two Effect fixes are worth knowing about if they touch your code. HTTP actions written with `HttpRouter` now collect uploaded file contents far faster on large multipart bodies, and a file part whose stream is cut short—because a parser limit was exceeded or the request body ended early—now fails instead of hanging. Separately, `Duration` values that are equal now hash equally, so a `Duration` used as a `HashMap` key or a `HashSet` member is found regardless of which constructor built it.

- Raise the required `effect` peer version to `^4.0.0-beta.98` (from `^4.0.0-beta.97`).

  `effect`'s `SchemaError` is now exposed as its own public module (`effect/SchemaError`), which changes the import path TypeScript picks when Confect emits `.d.ts` declarations that reference `Schema.SchemaError` (for example in generated `services.d.ts`). Existing `Schema.SchemaError`/`Schema.isSchemaError` usage is unaffected—this is purely a declaration-emit detail that consumers relying on generated types may notice.

- Raise the required `effect` peer version to `^4.0.0-beta.99` (from `^4.0.0-beta.98`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.99` release only touches `Graph`, CLI (`Command`/`CliConfig`/wizard mode), `Tool` cloning, Redis script eval, and multipart parser internals that Confect doesn't use.

- Raise the required `effect` peer version to `^4.0.0-rc.108` (from `^4.0.0-beta.107`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise. Effect v4 has left beta for release candidates, so `effect@rc` is now the tag to install alongside `@confect/*`.

  No Confect API changed, and no call-site edits are needed for Confect itself. One Effect change can reach your code: the standalone `effect/SchemaError` module is gone, and `SchemaError` is now exported from `Schema`. Confect still fails decoding with the same error, so this only matters if you name the type when handling it.

  Before:

  ```ts
  import type { SchemaError } from "effect/SchemaError";
  ```

  After:

  ```ts
  import type { SchemaError } from "effect/Schema";
  ```

  Also worth knowing if you serve an `HttpApi`: a query parameter declared as an array now decodes correctly when a request supplies exactly one value for it.

  One internal change rides along. Queries and mutations that run long enough to trigger a cooperative fiber yield now take that yield from Effect's own scheduler, which `rc.108` made usable inside Convex's isolate for the first time. The underlying microtask primitive is identical, so behavior should not change—but it is the thing to look at if a long-running query or mutation regresses on this release.

- Raise the required `effect` peer version to `^4.0.0-rc.109` (from `^4.0.0-rc.108`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  No Confect API changed, and no call-site edits are needed. `rc.109` is a patch release of Effect with nothing removed or renamed, so upgrading is a matter of installing it alongside `@confect/*`.

- 8e4962e: Raise the required `effect` peer version to `^4.0.0-rc.110` (from `^4.0.0-rc.109`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  No Confect API changed, and no call-site edits are needed. `rc.110` is a patch release of Effect with nothing removed or renamed, so upgrading is a matter of installing it alongside `@confect/*`.

- 3f0255c: Build and test against `convex` 1.44.0. The published `convex` peer ranges are unchanged, so no consumer action is required.
- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.2.2–9.2.4—see those versions' changelog entries.
- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.2.5—see that version's changelog entries.
- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.3.0—see that version's changelog entries.
- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.4.0—see that version's changelog entries.

  The `@effect/platform` and `@effect/cli` peer and dependency floors that 9.4.0 raises do not apply here: this line runs on Effect v4, where those packages are not dependencies at all.

- The published type declarations are now emitted by TypeScript 7 rather than TypeScript 6. No API changed, but the declaration text differs in places, so an inferred type printed in your editor or in a type error may read slightly differently than before.

## 10.0.0-next.15

### Patch Changes

- 8e4962e: Raise the required `effect` peer version to `^4.0.0-rc.109` (from `^4.0.0-rc.108`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  No Confect API changed, and no call-site edits are needed. `rc.109` is a patch release of Effect with nothing removed or renamed, so upgrading is a matter of installing it alongside `@confect/*`.

## 10.0.0-next.14

### Major Changes

- bb09030: `TestConfect.layer` now returns a `Layer` directly rather than a function returning one. Drop the trailing call.

  Before:

  ```ts
  export const layer = TestConfect_.layer(
    confectSchema,
    convexSchema,
    import.meta.glob("./convex/**/!(*.*.*)*.*s"),
  );

  // …then, per test:
  Effect.gen(function* () {
    // …
  }).pipe(Effect.provide(TestConfect.layer()));
  ```

  After:

  ```ts
  export const layer = TestConfect_.layer(
    confectSchema,
    convexSchema,
    import.meta.glob("./convex/**/!(*.*.*)*.*s"),
  );

  // …then, per test:
  Effect.gen(function* () {
    // …
  }).pipe(Effect.provide(TestConfect.layer));
  ```

  Each test still gets its own database. The layer is built once per `Effect.provide`, so providing the same value to several tests constructs a fresh test instance for each—the same isolation the extra call used to provide.

### Patch Changes

- 9d51bd3: Raise the required `effect` peer version to `^4.0.0-rc.108` (from `^4.0.0-beta.107`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise. Effect v4 has left beta for release candidates, so `effect@rc` is now the tag to install alongside `@confect/*`.

  No Confect API changed, and no call-site edits are needed for Confect itself. One Effect change can reach your code: the standalone `effect/SchemaError` module is gone, and `SchemaError` is now exported from `Schema`. Confect still fails decoding with the same error, so this only matters if you name the type when handling it.

  Before:

  ```ts
  import type { SchemaError } from "effect/SchemaError";
  ```

  After:

  ```ts
  import type { SchemaError } from "effect/Schema";
  ```

  Also worth knowing if you serve an `HttpApi`: a query parameter declared as an array now decodes correctly when a request supplies exactly one value for it.

  One internal change rides along. Queries and mutations that run long enough to trigger a cooperative fiber yield now take that yield from Effect's own scheduler, which `rc.108` made usable inside Convex's isolate for the first time. The underlying microtask primitive is identical, so behavior should not change—but it is the thing to look at if a long-running query or mutation regresses on this release.

- a4054ab: The published type declarations are now emitted by TypeScript 7 rather than TypeScript 6. No API changed, but the declaration text differs in places, so an inferred type printed in your editor or in a type error may read slightly differently than before.

## 10.0.0-next.13

### Patch Changes

- 5a73763: Raise the required `effect` peer version to `^4.0.0-beta.107` (from `^4.0.0-beta.106`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.107` is a patch-only Effect release, so no Confect API changes and no call-site edits are needed—upgrade `effect` alongside `@confect/*` and everything you have written keeps compiling. Your table, argument, and returns schemas still produce the same Convex validators.

  Two Effect fixes are worth knowing about if they touch your code. HTTP actions written with `HttpRouter` now collect uploaded file contents far faster on large multipart bodies, and a file part whose stream is cut short—because a parser limit was exceeded or the request body ended early—now fails instead of hanging. Separately, `Duration` values that are equal now hash equally, so a `Duration` used as a `HashMap` key or a `HashSet` member is found regardless of which constructor built it.

## 10.0.0-next.12

### Patch Changes

- 661ee9b: Raise the required `effect` peer version to `^4.0.0-beta.106` (from `^4.0.0-beta.105`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.106` is a patch-only Effect release. Nothing in Confect's own API changes, and your table, argument, and returns schemas still compile to the same Convex validators.

  One Effect change needs a call-site edit if you derive property-test generators from those schemas: `Schema.toArbitrary` now returns a factory that takes the `fast-check` module instead of returning an arbitrary directly, and `Schema.toArbitraryLazy` and the `{ report: true }` option are gone.

  **Before:**

  ```ts
  const NoteArbitrary = Schema.toArbitrary(Note);
  ```

  **After:**

  ```ts
  import * as FastCheck from "fast-check";

  const NoteArbitrary = Schema.toArbitrary(Note)(FastCheck);
  ```

  HTTP actions written against `HttpRouter` also inherit Effect's stricter multipart handling: a request that exceeds the configured part count, part size, or field size limits now stops being parsed at the limit rather than being read to completion first.

## 10.0.0-next.11

### Patch Changes

- f782cdd: Raise the required `effect` peer version to `^4.0.0-beta.105` (from `^4.0.0-beta.102`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

  `beta.103` separates wall-clock time from monotonic elapsed time: `Clock.Clock` now also requires `monotonicTimeNanos` and `monotonicTimeNanosUnsafe`, so a custom `Clock` provided to a Confect function has to supply both. Effects that measure elapsed time—`Effect.timed`, duration metrics, `Sink.withDuration`—read the monotonic accessors instead of the wall clock, and continue to report a zero duration inside queries and mutations, where Confect pins the unsafe accessors to constants to keep Convex's query cache from evicting on every logged span.

  `beta.103` also moves synchronous Effect runs off `setImmediate`/`setTimeout` and onto the microtask queue, which Convex's query and mutation isolate permits. Confect no longer suppresses cooperative fiber yielding for the synchronous work it performs while your modules load—registration and schema-to-validator compilation—and relies on that scheduling instead. Neither the "Can't use `setTimeout` in queries and mutations" crash nor any other consumer-visible behavior changes, but this is the area to look at if module loading starts misbehaving.

  `beta.104` renames Effect's schema error constructors to match their `Data` counterparts, which affects any error schema you declare for a Confect function:

  **Before:**

  ```ts
  export class NoteNotFound extends Schema.TaggedErrorClass<NoteNotFound>()(
    "NoteNotFound",
    { noteId: Id("notes") },
  ) {}
  ```

  **After:**

  ```ts
  export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
    "NoteNotFound",
    { noteId: Id("notes") },
  ) {}
  ```

  `Schema.ErrorClass` is likewise now `Schema.Error`; the schema for JavaScript `Error` instances that previously went by `Schema.Error` is now `Schema.ErrorInstance`, and `Schema.ErrorReviver` is now `Schema.ErrorInstanceReviver`. Confect's own error types—`DocumentDecodeError`, `BlobNotFoundError`, and the rest—are unchanged in name, shape, and message.

  `beta.105` restructures how schema validation failures are reported, but not on the path Confect puts you on: decode and encode failures still surface as `Schema.SchemaError` with a formatted `message`, so error text from `@confect/js`, `@confect/react`, and document decoding is unchanged.

- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.4.0—see that version's changelog entries.

  The `@effect/platform` and `@effect/cli` peer and dependency floors that 9.4.0 raises do not apply here: this line runs on Effect v4, where those packages are not dependencies at all.

## 10.0.0-next.10

### Patch Changes

- Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.3.0—see that version's changelog entries.

## 10.0.0-next.9

### Patch Changes

- 0dcc0fb: Raise the required `effect` peer version to `^4.0.0-beta.102` (from `^4.0.0-beta.101`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.
- 25e8d19: Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.2.5—see that version's changelog entries.

## 10.0.0-next.8

### Patch Changes

- 913d0e5: Raise the required `effect` peer version to `^4.0.0-beta.101` (from `^4.0.0-beta.100`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.101` release only touches fiber/concurrency internals (interrupt handling in concurrent traversal, stack frame annotations, `awaitAllChildren` linearization, `interruptibleMask` interrupt delivery), a `MutableList.filter` fix for empty buckets, a `Schema.Struct` required-readonly-field type display simplification, and an `HttpRouter.toWebHandler` middleware type-inference tightening that Confect doesn't need to accommodate.

## 10.0.0-next.7

## 10.0.0-next.6

## 10.0.0-next.5

## 10.0.0-next.4

## 10.0.0-next.3

### Patch Changes

- 5b63546: Raise the required `effect` peer version to `^4.0.0-beta.100` (from `^4.0.0-beta.99`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.100` release only touches `Cron` internals (month/weekday alias normalization, day/weekday rollover, and equality/hashing), CLI error message formatting (`InvalidValue` prefixes), and `Schema.toTaggedUnion` discriminants that Confect doesn't use.

## 10.0.0-next.2

### Patch Changes

- 35f7515: Raise the required `effect` peer version to `^4.0.0-beta.99` (from `^4.0.0-beta.98`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.99` release only touches `Graph`, CLI (`Command`/`CliConfig`/wizard mode), `Tool` cloning, Redis script eval, and multipart parser internals that Confect doesn't use.

- 2aa7541: Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.2.2–9.2.4—see those versions' changelog entries.

## 10.0.0-next.1

### Patch Changes

- 4d98ea8: Raise the required `effect` peer version to `^4.0.0-beta.98` (from `^4.0.0-beta.97`).

  `effect`'s `SchemaError` is now exposed as its own public module (`effect/SchemaError`), which changes the import path TypeScript picks when Confect emits `.d.ts` declarations that reference `Schema.SchemaError` (for example in generated `services.d.ts`). Existing `Schema.SchemaError`/`Schema.isSchemaError` usage is unaffected—this is purely a declaration-emit detail that consumers relying on generated types may notice.

- Updated dependencies [4d98ea8]
  - @confect/core@10.0.0-next.1
  - @confect/server@10.0.0-next.1

## 10.0.0-next.0

### Major Changes

- 70e313e: Migrate to Effect v4. All `@confect/*` packages now require `effect@^4.0.0-beta.97`; `@effect/platform` and `@effect/cli` are no longer dependencies (their functionality moved into `effect` core and `effect/unstable/*`).

  Breaking changes for users:
  - **Schemas** follow Effect v4's Schema API: `Schema.Union([a, b])` (array form), `Schema.Literals([...])` for literal unions, `Schema.optionalKey` in place of `optionalWith({ exact: true })`, `Schema.TaggedErrorClass` in place of `Schema.TaggedError`, and checks like `Schema.String.check(Schema.isMaxLength(...))` in place of piped filters.
  - **Option-returning functions** must use a codec with a serializable encoded form, such as `Schema.OptionFromNullOr(...)`—v4's `Schema.Option` encodes to an `Option` instance, which is not a Convex value.
  - **Table schemas** may now be transformations (`Schema.decodeTo` chains, `Schema.encodeKeys`), branded structs, suspended schemas, or unions of these—Convex's system fields are carried through the whole encoding chain. Schemas that do not resolve to an object shape at every step (such as `Schema.Class`) are rejected with a descriptive error when the table is defined.
  - **Clients**: decode failures surface as `SchemaError` rather than `ParseError` in `@confect/js` and `@confect/react`, and `@confect/react`'s `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`).
  - **HTTP** is now mounted through the renamed `HttpRouter` module (formerly `HttpApi`). `HttpRouter.make(routes)` takes a single route-registering `Layer` composed from Effect's own `effect/unstable/http` and `effect/unstable/httpapi` modules—`HttpApiBuilder.layer(api)` (with group handler layers supplied via `Layer.provide`; a missing group is a compile-time error), `HttpApiScalar.layer` for docs, `HttpRouter.add` for plain routes, and `HttpRouter.middleware(fn, { global: true })` for middleware, merged with `Layer.mergeAll`. The per-path-prefix record and its `api`/`apiLive`/`middleware`/`scalar` options are gone; Confect registers one catch-all Convex HTTP action at `/`, and plain Convex routes added to the returned router still take precedence. Handlers, middleware, and route-layer construction all run with Confect's Convex-aware `ConfigProvider` in context.
  - **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
  - **Configuration**: Confect's Convex-aware `ConfigProvider` treats empty-string environment variables as missing values (matching Effect v4's built-in providers), so `Config.withDefault` and `Config.option` recover from them.
  - **CLI**: a malformed `convex.json` now fails codegen with a descriptive error instead of being silently ignored.
  - Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads—`Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call—opt the query out and evict as they honestly should.

### Patch Changes

- Updated dependencies [70e313e]
  - @confect/core@10.0.0-next.0
  - @confect/server@10.0.0-next.0

## 9.4.2

## 9.4.1

### Patch Changes

- a4054ab: The published type declarations are now emitted by TypeScript 7 rather than TypeScript 6. No API changed, but the declaration text differs in places, so an inferred type printed in your editor or in a type error may read slightly differently than before.

## 9.4.0

## 9.3.0

## 9.2.5

## 9.2.4

## 9.2.3

### Patch Changes

- @confect/core@9.2.3
- @confect/server@9.2.3

## 9.2.2

### Patch Changes

- Updated dependencies [7e7b2a4]
  - @confect/server@9.2.2
  - @confect/core@9.2.2

## 9.2.1

### Patch Changes

- @confect/core@9.2.1
- @confect/server@9.2.1

## 9.2.0

### Patch Changes

- @confect/core@9.2.0
- @confect/server@9.2.0

## 9.1.5

### Patch Changes

- @confect/core@9.1.5
- @confect/server@9.1.5

## 9.1.4

### Patch Changes

- @confect/core@9.1.4
- @confect/server@9.1.4

## 9.1.3

### Patch Changes

- Updated dependencies [8d63382]
  - @confect/core@9.1.3
  - @confect/server@9.1.3

## 9.1.2

### Patch Changes

- Updated dependencies [e2bb5ef]
  - @confect/server@9.1.2
  - @confect/core@9.1.2

## 9.1.1

### Patch Changes

- Updated dependencies [308b347]
  - @confect/server@9.1.1
  - @confect/core@9.1.1

## 9.1.0

### Patch Changes

- Updated dependencies [8bbde87]
- Updated dependencies [4d8a568]
  - @confect/server@9.1.0
  - @confect/core@9.1.0

## 9.0.2

### Patch Changes

- Updated dependencies [dd33006]
  - @confect/server@9.0.2
  - @confect/core@9.0.2

## 9.0.1

### Patch Changes

- 445ea9b: Loosen and align dependency ranges across all packages:
  - The `convex` peer dependency is now `^1.32.0` in every package (previously pinned exactly to `1.39.1`, or `^1.30.0` in `@confect/react`). The range is validated against convex 1.32.0 through 1.40.0.
  - `@confect/server`'s `@effect/platform-node` peer dependency is now optional—it is only needed when using the `@confect/server/node` entrypoint.
  - `@confect/cli` now uses caret ranges for its `@effect/platform` and `@effect/platform-node` dependencies so they can deduplicate with the versions resolved for `@confect/server`, and no longer declares an unused direct dependency on `@effect/platform-node-shared`.
  - `@confect/test` now accepts any `convex-test` release in `>=0.0.50 <0.1.0` instead of exactly 0.0.50.

- Updated dependencies [445ea9b]
  - @confect/core@9.0.1
  - @confect/server@9.0.1

## 9.0.0

### Major Changes

- a905072: Rearchitect Confect so that cold-starting a Convex function only evaluates its own group's module graph, cutting cold-start execution time on large projects. The change touches how you author tables, specs, and impls, and removes the project-wide aggregation that used to make every function evaluate every other function's code—and every table's schema—the first time it ran.

  Convex bundles a deployment into a single artifact, but a function's cold start only _evaluates_ the module graph reachable from its own entry point. Previously, all impls were assembled into a single root `confect/impl.ts` that every generated `convex/` module imported, so cold-starting any one query, mutation, or action transitively evaluated the impl of every other function in the project, plus every function spec and every table schema, at module-load time. Cold-start execution time scaled with the size of the whole project. In v9, `confect codegen` emits one registry per group and each generated `convex/` module imports only its own group—so a function's cold-start work scales with its own group, not the project.

  ### Filesystem-driven groups

  Your API is now authored as colocated `*.spec.ts`/`*.impl.ts` pairs, one pair per group, and **the file's path within `confect/` is the group's name** (its stem for top-level groups, the dot-joined directory path for nested groups). `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument.
  - Each `*.spec.ts` `export default`s its `GroupSpec` (named co-exports like error classes are still allowed).
  - Each `*.impl.ts` default-imports its sibling spec, passes it to `FunctionImpl.make`/`GroupImpl.make`, and ends the layer pipeline with `GroupImpl.finalize`—a compile-time completeness check that only typechecks once every function the spec declares has a `FunctionImpl` provided.
  - The root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, and `confect/nodeImpl.ts` files are gone, along with `Impl.make` and `Impl.finalize`. `confect codegen` deletes any of these (and the stale aggregate `_generated/registeredFunctions.ts`/`_generated/nodeRegisteredFunctions.ts`) on upgrade.

  ### Tables are the source of truth, named by their filename

  Your schema now lives entirely in `confect/tables/`, one `Table` per file, and **the filename is the table name**—`confect/tables/notes.ts` defines the `notes` table. `Table.make` no longer takes a name argument. The user-authored `confect/schema.ts` is removed; codegen scans `confect/tables/*.ts` and generates everything else.

  Each table file is a default-export-only module, and its field schema is wrapped in a `() =>` callback so it is built lazily—a function only pays a table's schema-construction cost at cold start for tables it actually reads.

  ```ts confect/tables/notes.ts
  import { Table } from "@confect/server";
  import { Schema } from "effect";
  import { Id } from "../_generated/id";

  export default Table.make(() =>
    Schema.Struct({
      userId: Schema.optional(Id("users")),
      text: Schema.String,
    }),
  );
  ```

  Codegen emits, alongside it:
  - `_generated/schema.ts`—the runtime `DatabaseSchema`. Never imports `convex/server`, so a runtime cold start no longer evaluates `defineSchema(...)`.
  - `_generated/convexSchema.ts`—the Convex deploy `SchemaDefinition`, re-exported from `convex/schema.ts`.
  - `_generated/id.ts`—a type-safe `Id` constructor whose argument is constrained to your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`; cross-table `_id` typos are now caught at compile time.
  - `_generated/tables/<name>.ts`—a thin wrapper that binds the filename to the table. Read a table's `Doc`, `Fields`, and `tableName` from this wrapper (`import notes from "../_generated/tables/notes"`), not from `confect/tables/`.

  A bound table's `name` property is renamed to `tableName` (avoiding a collision with `Function.prototype.name`).

  ### Specs and impls: lazy schemas, and impls take the `DatabaseSchema`

  `FunctionSpec.*` constructors now take `args`, `returns`, and the optional `error` as `() => Schema` thunks, so importing a spec builds no schemas until a function is invoked. `FunctionImpl.make` and `GroupImpl.make` take the runtime `DatabaseSchema` (the default export of `_generated/schema`) as their first argument instead of the whole `Api`—which keeps the project-wide spec graph out of a function's cold-start module graph. The `Api` module (`Api.make`, the `Api` type) and the generated `_generated/api.ts`/`_generated/nodeApi.ts` files are removed.

  **Before:**

  ```ts confect/notes.spec.ts
  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  const list = FunctionImpl.make(api, "notes", "list", handler);
  export const notes = GroupImpl.make(api, "notes").pipe(Layer.provide(list));
  ```

  **After:**

  ```ts confect/notes.spec.ts
  import notes from "./_generated/tables/notes";

  export default GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => Schema.Struct({}),
      returns: () => Schema.Array(notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  import databaseSchema from "./_generated/schema";
  import notes from "./notes.spec";

  const list = FunctionImpl.make(databaseSchema, notes, "list", handler);
  export default GroupImpl.make(databaseSchema, notes).pipe(
    Layer.provide(list),
    GroupImpl.finalize,
  );
  ```

  ### Node functions are first-class

  A group's runtime is now declared solely by its spec—`GroupSpec.makeNode()` for a Node action group, `GroupSpec.make()` otherwise—mirroring vanilla Convex's per-file `"use node"` directive. The separate `node` namespace is gone: Node specs/impls are ordinary colocated pairs that can live anywhere in `confect/`, and codegen emits the `"use node"` directive based on the spec.
  - A Node group at `confect/email.spec.ts` is now reached at `refs.public.email.send` instead of `refs.public.node.email.send`.
  - `@confect/core` removes `Spec.makeNode`, `Spec.merge`, and `Spec.isConvexSpec`/`Spec.isNodeSpec`; `Spec.make()` is a single mixed-runtime container and `Refs.make(spec)` takes one argument. `GroupSpec.makeNode()`, `FunctionSpec.publicNodeAction()`/`internalNodeAction()` are unchanged.

  ### Less work at cold start

  Confect's own packages now import Effect from its submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel. A barrel import of a namespace re-export pulls the entire namespace into the module graph a function evaluates at cold start, even when only a small part is used; importing the submodule path evaluates only what's needed. On a minimal function this cut cold-start module-evaluation time by ~35%. This is an internal change with no effect on your code—but to get the full win, import Effect from its submodule paths in your own `confect/` files too, since a single barrel import anywhere in a function's module graph re-pins the whole namespace.

  ### Stable React hook results

  `@confect/react` hooks now hold stable identities across renders, matching Convex's own hooks. `useQuery` memoizes the decoded `QueryResult` by the (referentially stable) Convex result, so unchanged data keeps the same `QueryResult` instead of a fresh one each render—fixing effect/memo loops (including `Maximum update depth exceeded`) for code that derives off the result. `useMutation` and `useAction` return a stable `useCallback`, and `Ref.getFunctionReference` caches the Convex function reference per function name.

  ### Codegen robustness

  The codegen bundler now uses [`bundle-require`](https://github.com/egoist/bundle-require), so impls may import third-party packages and use `tsconfig.json` `paths` aliases (`~/*`, `@/*`, …) for their own source. A parent `confect/{path}.spec.ts` may now declare functions alongside a sibling `confect/{path}/` subdirectory of further specs, and codegen reports a clear error on a name collision between the two.

  ### Migration
  1. **Tables.** Delete `confect/schema.ts`. Rename each table file to a valid JS identifier (e.g. `confect/tables/notes.ts`); the basename becomes the table name. Drop the name argument from `Table.make`, wrap the field struct in `() =>`, and replace `GenericId.GenericId("x")` with `Id("x")` from `_generated/id`. If you read `table.name` off a bound table, rename it to `table.tableName`.
  2. **Specs.** Split each group into a colocated `*.spec.ts` that `export default`s `GroupSpec.make()` (no name). Wrap every `args`/`returns`/`error` in `() =>`. Import a table's `Doc`/`Fields` from its wrapper, `import notes from "./_generated/tables/notes"`.
  3. **Impls.** In each `*.impl.ts`, default-import the sibling spec, import `databaseSchema` from `_generated/schema`, pass it to `FunctionImpl.make`/`GroupImpl.make` in place of `api`, end the pipeline with `GroupImpl.finalize`, and `export default` it. Delete the root `confect/spec.ts`, `impl.ts`, `nodeSpec.ts`, and `nodeImpl.ts` (codegen will also remove them).
  4. **Node groups.** Move any `confect/node/<path>` files anywhere you like under `confect/`; the `node/` directory no longer has special meaning. Drop the `node` segment from call sites (`refs.public.node.<group>` → `refs.public.<group>`) and replace `Refs.make(spec, nodeSpec)` with `Refs.make(spec)`.
  5. **Tests.** If you use `@confect/test`, import `confectSchema` from `_generated/schema`, import the generated `convexSchema` from `_generated/convexSchema`, and pass `convexSchema` as the new second argument to `TestConfect.layer`.
  6. **Optional.** Adopt submodule Effect imports (`import * as Schema from "effect/Schema"`) in your own `confect/` files for the full cold-start savings.
  7. Run `confect codegen`. It re-emits the entire `convex/` tree and `confect/_generated/`, deleting any stale files from earlier versions.

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
- Updated dependencies [a905072]
  - @confect/core@9.0.0
  - @confect/server@9.0.0

## 9.0.0-next.10

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
  - @confect/core@9.0.0-next.10
  - @confect/server@9.0.0-next.10

## 9.0.0-next.9

### Patch Changes

- Updated dependencies [4894959]
  - @confect/core@9.0.0-next.9
  - @confect/server@9.0.0-next.9

## 9.0.0-next.8

### Patch Changes

- 3fec285: Import Effect from its submodule paths internally to shrink per-function cold-start bundles.

  Confect's packages now import Effect modules from their submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel (`import { Schema } from "effect"`).

  ### Why

  A barrel import of a namespace re-export defeats esbuild's tree-shaking: accessing `Schema.X` from `import { Schema } from "effect"` retains the _entire_ `Schema` namespace, because the bundler can't prune property access on the barrel's `export * as Schema`. So every Convex function's cold-start bundle was pulling all of `effect/Schema` and `effect/Stream`—and, transitively through Schema's `Arbitrary`, `fast-check`—whether the function used them or not.

  Importing from the submodule path tree-shakes normally. On a minimal function this cut the bundle esbuild produces by ~54% (the `effect/Schema` module alone by ~75%) and its cold-start module-evaluation time by ~35%, with `fast-check` dropped entirely. This is also the import style Effect v4 recommends, so it's forward-compatible. A `no-restricted-imports` ESLint rule now enforces it across the codebase (type-only imports and `@effect/vitest` are exempt).

  No API changes—your existing code keeps working.

  ### Getting the full win in your own code

  This change shrinks the Confect code in every function bundle, but a function's bundle also includes your own `confect/tables/*` and `*.spec.ts` files. esbuild retains the union across all importers, so a single barrel import anywhere in a function's module graph re-pins the whole `effect/Schema` namespace and undoes the reduction. To get the full bundle/cold-start savings, import Effect from its submodule paths in your own Confect files too:

  ```diff
  - import { Schema } from "effect";
  + import * as Schema from "effect/Schema";
  ```

  Bare helpers (`pipe`, `flow`, `identity`) come from `"effect/Function"`.

- Updated dependencies [3fec285]
  - @confect/core@9.0.0-next.8
  - @confect/server@9.0.0-next.8

## 9.0.0-next.7

### Patch Changes

- Updated dependencies [5d19484]
  - @confect/core@9.0.0-next.7
  - @confect/server@9.0.0-next.7

## 9.0.0-next.6

### Major Changes

- 762f7eb: Split the deploy-time Convex schema from the runtime `DatabaseSchema`, make `confect/tables/` the single source of truth—including the table name, which is now derived from the filename—and make per-table schema construction lazy.

  Previously, `confect/schema.ts` was user-authored and `DatabaseSchema` carried a `convexSchemaDefinition` field that was eagerly rebuilt on every `.addTable(...)`. That field was an `O(n²)` allocation for `n` tables, and it forced both the deploy CLI (which only needs `defineSchema(...)`) and the runtime (which only needs the table codec lookup) through the same module—so any runtime function bundle dragged in `convex/server`'s `defineSchema`. Issue 1.

  Codegen now scans `confect/tables/*.ts` (every file must default-export a `Table`) and emits two siblings:
  - `confect/_generated/schema.ts`—the runtime `DatabaseSchema`, consumed by `_generated/api.ts`. Imports `@confect/server` but never `convex/server`.
  - `confect/_generated/convexSchema.ts`—the Convex deploy `SchemaDefinition`, re-exported one-line from `convex/schema.ts`. Imports `convex/server` but never `@confect/server`.

  The `convexSchemaDefinition` field is removed from `DatabaseSchema` and `Api`. `TestConfect.layer` now takes the Convex schema definition as a separate argument so it can stay aligned with the deploy artifact without bringing the runtime schema along for the ride.

  ### Filename-derived table names

  The table name is now derived from the file's basename—`confect/tables/notes.ts` defines a table called `notes`. `Table.make` no longer accepts a name argument and returns an _unnamed_ `Table` value; codegen invokes that value with the filename to produce the bound table.

  This eliminates a class of subtle infelicities: the file basename and the table name can never drift out of sync, cross-table `_id` references are type-constrained against the actual set of declared tables (catching typos at compile time), and ESM cycle hazards for mutual cross-table `Id` references are gone because authoring files no longer transitively import each other.

  Codegen now emits two new sets of files alongside `_generated/schema.ts` and `_generated/convexSchema.ts`:
  - `confect/_generated/id.ts`—a single `Id` constructor whose argument is type-constrained to the union of your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`.
  - `confect/_generated/tables/<name>.ts`—one thin wrapper per table that binds the unnamed value from `confect/tables/<name>.ts` to its filename. This is what other modules (specs, impls, HTTP handlers) default-import to reach a table's `Doc`, `Fields`, and `tableName`.

  Table filenames must be valid JS identifiers, may not start with `_` (Convex reserves underscore-prefixed names for system tables), and may not collide with reserved JS keywords like `import.ts`. Pick a casing convention you like—Confect's example code uses `snake_case` (`notes.ts`, `user_profiles.ts`).

  The bound `Table`'s `name` property has been renamed to `tableName`. This avoids a silent collision with the built-in `Function.prototype.name` that JavaScript carries on every function value (including the new unnamed-callable `UnnamedTable`).

  ### Lazy per-table schema construction

  `Table.make` takes a `() => Schema.Struct({...})` callback rather than a bare struct, and a bound `Table`'s `Fields`, `Doc`, and `tableDefinition` are lazy memoised getters that only invoke that callback on first access.

  Previously, every `confect/tables/<name>.ts` module ran `Schema.Struct({...})` (and the corresponding `compileTableSchema`/`defineTable` work) at module-load time. Because the codegen-emitted `_generated/schema.ts` is imported transitively from every per-group function bundle, loading any one function eagerly built _every_ table's schema graph—paying a cold-start cost proportional to the whole project, not just the function being invoked.

  The bound `Table` now exposes `Fields`/`Doc`/`tableDefinition` as lazy getters that compute their value on first access, then replace themselves with a plain non-writable data property so second-and-subsequent accesses are observably indistinguishable from a plain property (and skip all function-call overhead). The result: a function bundle only pays the schema-construction cost for tables it actually touches via `db.table(name)` (which reaches `Fields` through `Document.decode`). The `UnnamedTable` callable no longer exposes `Fields` or `tableDefinition`—read these off the bound `Table` (the generated `_generated/tables/<name>.ts` wrapper already binds the name).

  ### Migration
  1. Delete your `confect/schema.ts`. Codegen will refuse to run while a stray copy is present.
  2. Rename each `confect/tables/<Name>.ts` to a valid JS identifier in your chosen casing convention (e.g. `confect/tables/notes.ts`). The basename becomes the table name; you no longer pass it as an argument.
  3. Convert each table file to a **default-export-only** unnamed module: drop the name argument from `Table.make`, wrap the field-schema struct in a `() => ...` callback, and switch any `GenericId.GenericId("users")` references to `Id("users")` imported from `../_generated/id`:

     ```diff
     - import { GenericId } from "@confect/core";
       import { Table } from "@confect/server";
       import { Schema } from "effect";
     + import { Id } from "../_generated/id";

     - export default Table.make(
     -   "notes",
     -   Schema.Struct({
     -     userId: Schema.optional(GenericId.GenericId("users")),
     -     text: Schema.String,
     -   }),
     - );
     + export default Table.make(() =>
     +   Schema.Struct({
     +     userId: Schema.optional(Id("users")),
     +     text: Schema.String,
     +   }),
     + );
     ```

  4. Rewire every consumer site (specs, impls, integration tests, HTTP handlers, etc.) to import from the generated wrapper rather than directly from `tables/`. The wrapper is also where you now read `Doc`/`Fields`/`tableDefinition` (the unnamed `Table.make(...)` callable no longer exposes them):

     ```diff
     - import Notes from "../tables/Notes";
     + import notes from "../_generated/tables/notes";

     - returns: Schema.Array(Notes.Doc),
     + returns: Schema.Array(notes.Doc),
     ```

  5. Replace every remaining `GenericId.GenericId("x")` call site with `Id("x")` from `_generated/id` (in spec `args`/`returns`, in `TaggedError` schemas, in `TestConfect.run`, etc.).
  6. If you read `table.name` anywhere off a bound `Table`, rename it to `table.tableName`.
  7. Re-run `confect codegen`. It will create `confect/_generated/schema.ts`, `confect/_generated/convexSchema.ts`, `confect/_generated/id.ts`, and one `confect/_generated/tables/<name>.ts` wrapper per table; and it will rewrite `convex/schema.ts` to a one-line re-export.
  8. If you use `@confect/test`, pass the generated Convex schema definition to `TestConfect.layer`:

     ```diff
     - import confectSchema from "./confect/schema";
     + import confectSchema from "./confect/_generated/schema";
     + import convexSchema from "./confect/_generated/convexSchema";

       export const layer = TestConfect_.layer(
         confectSchema,
     +   convexSchema,
         import.meta.glob("./convex/**/!(*.*.*)*.*s"),
       );
     ```

  ### New warning: no tables discovered

  If a Confect project has no tables—either `confect/tables/` is missing entirely or it exists but contains no `.ts` files—codegen now emits a yellow `⚠` warning and continues, producing an empty `DatabaseSchema.make()`/`defineSchema({})`. Table-free backends (e.g. action-only proxies, webhook bridges) are still legal; the warning just catches the much more common case of a typoed directory name or files placed at the wrong path. To silence it, add at least one `Table.make(...)` module under `confect/tables/`.

  ### New error: invalid table filename

  Codegen now rejects table files whose basename is not a valid JS identifier (e.g. `user-profiles.ts`), starts with `_` (reserved for Convex system tables), or shadows a reserved JS keyword (e.g. `import.ts`). Rename the offending file to fix it—for example, `user-profiles.ts` → `user_profiles.ts` or `userProfiles.ts`.

### Patch Changes

- Updated dependencies [46045a9]
- Updated dependencies [762f7eb]
  - @confect/core@9.0.0-next.6
  - @confect/server@9.0.0-next.6

## 9.0.0-next.5

### Patch Changes

- @confect/core@9.0.0-next.5
- @confect/server@9.0.0-next.5

## 9.0.0-next.4

### Patch Changes

- @confect/core@9.0.0-next.4
- @confect/server@9.0.0-next.4

## 9.0.0-next.3

### Patch Changes

- Updated dependencies [6d85210]
  - @confect/core@9.0.0-next.3
  - @confect/server@9.0.0-next.3

## 9.0.0-next.2

### Patch Changes

- @confect/core@9.0.0-next.2
- @confect/server@9.0.0-next.2

## 9.0.0-next.1

### Patch Changes

- @confect/core@9.0.0-next.1
- @confect/server@9.0.0-next.1

## 9.0.0-next.0

### Patch Changes

- Updated dependencies [6db3a3a]
  - @confect/core@9.0.0-next.0
  - @confect/server@9.0.0-next.0

## 8.0.0

### Minor Changes

- 4bb2722: Bump Effect ecosystem to latest. `@effect/platform` is now `^0.96.1` and `@effect/platform-node` is now `^0.106.0` in `@confect/server`'s peer dependencies; `effect` peer is now `^3.21.2` across packages. Consumers must upgrade `@effect/platform`, `@effect/platform-node`, and `effect` in lockstep when bumping `@confect/server`.

### Patch Changes

- 40c1cff: Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

  Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

  `@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.

- Updated dependencies [87b7207]
- Updated dependencies [4bb2722]
- Updated dependencies [f308edd]
- Updated dependencies [a02ef8a]
- Updated dependencies [40c1cff]
  - @confect/server@8.0.0
  - @confect/core@8.0.0

## 7.0.0

### Minor Changes

- 90094d0: Add typed errors to Confect functions (queries, mutations, and actions). Declare an optional `error` schema in `FunctionSpec` and recover it as a typed value at every call site—`useQuery`, `useMutation`, `useAction`, `HttpClient`, `WebSocketClient`, and `TestConfect`—without paying for it on functions that don't fail.

  Typed errors travel across the function boundary as Convex's native [`ConvexError`](https://docs.convex.dev/functions/error-handling/application-errors#throwing-application-errors): the encoded error sits in `ConvexError.data`, leaving the `returns` channel unsullied and preserving native Convex semantics for non-Confect callers of the same API.

  ### Authoring a function with typed errors

  `FunctionSpec` constructors now accept an optional `error` schema. To support multiple error shapes, combine them with `Schema.Union`.

  ```ts
  import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
  import { Schema } from "effect";

  export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
    "NoteNotFound",
    { noteId: GenericId.GenericId("notes") },
  ) {}

  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "getOrFail",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
      error: NoteNotFound,
    }),
  );
  ```

  The `FunctionImpl` for that ref can now `Effect.fail` (or `mapError` to) any value matching the declared schema. Whichever invocation path the caller takes—`useQuery`/`useMutation`/`useAction`, `HttpClient`, `WebSocketClient`, or `TestConfect`—Confect encodes the failure, transports it via `ConvexError`, and surfaces the decoded value in the appropriate channel for that call site.

  ```ts
  import { FunctionImpl } from "@confect/server";
  import { Effect } from "effect";
  import api from "../_generated/api";
  import { DatabaseReader } from "../_generated/services";
  import { NoteNotFound } from "./notes.spec";

  const getOrFail = FunctionImpl.make(api, "notes", "getOrFail", ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NoteNotFound({ noteId })));
    }),
  );
  ```

  ### Consuming a typed error

  `@confect/js` (`HttpClient`, `WebSocketClient`) and `@confect/test` (`TestConfect`) surface the decoded error in the `Effect` error channel alongside the existing `HttpClientError`/`WebSocketClientError`/`ParseError`:

  ```ts
  HttpClient.query(refs.public.notes.getOrFail, { noteId });
  // Effect.Effect<Note, NoteNotFound | HttpClientError | ParseError>
  ```

  ### `@confect/react`—breaking changes

  `useQuery`, `useMutation`, and `useAction` now expose typed errors, and `useQuery` returns a tagged result type instead of `Returns | undefined`.

  **`useQuery` now returns `QueryResult<A, E>`.** Loading and (when an `error` schema is declared) failure are reified as variants alongside success. Match on the result with `QueryResult.match`:

  Before:

  ```tsx
  const notes = useQuery(refs.public.notes.list, {});
  if (notes === undefined) return <p>Loading…</p>;
  return <NoteList notes={notes} />;
  ```

  After:

  ```tsx
  import { QueryResult, useQuery } from "@confect/react";

  const notes = useQuery(refs.public.notes.list, {});
  return QueryResult.match(notes, {
    onLoading: (skipped) => (skipped ? null : <p>Loading…</p>),
    onSuccess: (notes) => <NoteList notes={notes} />,
  });
  ```

  The `Loading` variant carries a `skipped: boolean` flag, exposed as the argument to `onLoading`. It distinguishes a query that is genuinely in flight (`skipped: false`) from one that is sitting idle because `"skip"` was passed as its args (`skipped: true`)—a distinction `convex/react`'s plain `undefined` return value cannot make. Use it to render a loading indicator only when work is actually happening, and an empty/placeholder state otherwise.

  When the ref declares an `error` schema, `onFailure` becomes required and receives the decoded typed error:

  ```tsx
  const lookup = useQuery(refs.public.notes.getOrFail, { noteId });
  QueryResult.match(lookup, {
    onLoading: (skipped) => (skipped ? null : "Looking up…"),
    onSuccess: (note) => `Found: ${note.text}`,
    onFailure: (error) => `Note ${error.noteId} not found.`,
  });
  ```

  `QueryResult` is a Confect-native type exported from `@confect/react`.

  **`useMutation` and `useAction` return `Promise<Either<A, E>>` when the ref declares an `error` schema.** Refs without an `error` schema continue to resolve to `Promise<A>`, matching the prior shape and `convex/react`'s behavior.

  ```ts
  const deleteOrFail = useMutation(refs.public.notes.deleteOrFail);
  const result = await deleteOrFail({ noteId });
  // Either.Either<null, NoteNotFound | Forbidden>
  Either.match(result, {
    onLeft: (error) => /* typed error */,
    onRight: (value) => /* success */,
  });

  const deleteNote = useMutation(refs.public.notes.delete_); // no `error` schema
  await deleteNote({ noteId }); // Promise<null>, as before
  ```

  Unspecified failures continue to reject the promise.

  ### Migration
  - For each `useQuery` call site, replace `result === undefined` checks and direct property access with `QueryResult.match` (or the lower-level `QueryResult.isLoading`/`isSuccess`/`isFailure` predicates).
  - For each `useMutation`/`useAction` call site whose ref now declares an `error` schema, unwrap the resolved `Either` (e.g. with `Either.match`); call sites against refs without an `error` schema need no change.

### Patch Changes

- Updated dependencies [90094d0]
  - @confect/core@7.0.0
  - @confect/server@7.0.0

## 6.0.0

### Minor Changes

- df95ce7: Add `Ref.OptionalArgs` type utility to `@confect/core` for conditionally optional function args. `QueryRunner`, `MutationRunner`, and `ActionRunner` now accept optional args for no-arg Confect functions. `useQuery`, `useMutation`, and `useAction` now accept optional args for no-arg Confect functions. `TestConfect` `query`/`mutation`/`action` helpers now accept optional args for no-arg Confect functions.

### Patch Changes

- Updated dependencies [df95ce7]
- Updated dependencies [a8083e8]
- Updated dependencies [228589b]
  - @confect/core@6.0.0
  - @confect/server@6.0.0

## 5.0.0

### Patch Changes

- Updated dependencies [8853cbf]
  - @confect/server@5.0.0
  - @confect/core@5.0.0

## 4.0.0

### Patch Changes

- Updated dependencies [60be7e6]
- Updated dependencies [641fd99]
- Updated dependencies [8ae4d51]
  - @confect/server@4.0.0
  - @confect/core@4.0.0

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

### Patch Changes

- Updated dependencies [5fb6a61]
  - @confect/core@3.0.0
  - @confect/server@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [69ce9c9]
- Updated dependencies [f78c58a]
  - @confect/server@2.0.0
  - @confect/core@2.0.0

## 1.0.3

### Patch Changes

- @confect/server@1.0.3
- @confect/core@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [c4f9d67]
  - @confect/server@1.0.2
  - @confect/core@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [00b12a0]
  - @confect/core@1.0.1
  - @confect/server@1.0.1

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- Updated dependencies [46109fb]
  - @confect/server@1.0.0-next.4
  - @confect/core@1.0.0-next.4

## 1.0.0-next.3

### Patch Changes

- Updated dependencies [9cd3cda]
- Updated dependencies [186c130]
  - @confect/server@1.0.0-next.3
  - @confect/core@1.0.0-next.3

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps
- Updated dependencies [071b6ed]
- Updated dependencies [afc9fb4]
  - @confect/server@1.0.0-next.2
  - @confect/core@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [5a4127f]
  - @confect/core@1.0.0-next.1
  - @confect/server@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.

### Patch Changes

- Updated dependencies [2ff70a7]
  - @confect/core@1.0.0-next.0
  - @confect/server@1.0.0-next.0
