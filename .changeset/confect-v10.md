---
"@confect/cli": major
"@confect/core": major
"@confect/foldkit": major
"@confect/js": major
"@confect/react": major
"@confect/server": major
"@confect/test": major
---

Migrate Confect to Effect 4, add middleware, experimental composable query streams, Foldkit bindings, and Convex AI gateway integrations. This release requires changes to function argument declarations, HTTP routers, runner calls, and test setup when upgrading from v9.

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

const Claude = AiGatewayLanguageModel.model("anthropic/claude-sonnet-4.5").pipe(
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
