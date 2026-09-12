# @confect/foldkit

## 10.0.0-next.22

### Minor Changes

- 6cc5834: Add experimental stream querying with reactive pagination, configurable middleware policies, and broader tracing.

  ### Stream queries and pagination

  Create composable Effect streams with `reader.table(...).stream(index, range?, order?)` and `QueryStream` from `@confect/server`. Merge, filter, map, join, deduplicate, narrow, and reverse queries without losing cursor pagination. Order keys and directions are checked by the type system. Joins support left-join placeholders through `onEmpty`, and effectful filters and maps support ordered concurrency. Reversing a distinct stream preserves its chosen representatives.

  `QueryStream.paginate` resumes from indexed cursor bounds and supports pinned page ranges, automatic split recommendations, and `maximumRowsRead`/`maximumBytesRead` budgets that count underlying query-stream reads, including filtered documents. Byte counts are estimates. If a budget prevents safe progress or splitting, pagination fails with `ReadBudgetExceededError`; increase the budget or reduce the query's read requirements.

  Use React's new `useStreamPaginatedQuery` for these queries:

  ```ts
  import { useStreamPaginatedQuery } from "@confect/react";

  const { results, status, loadMore } = useStreamPaginatedQuery(
    refs.public.notes.feed,
    {},
    {
      initialNumItems: 10,
      maximumRowsRead: 1000,
      maximumBytesRead: 512 * 1024,
    },
  );
  ```

  The hook pins loaded pages to fixed ranges, splits oversized or budget-limited pages, and restarts pagination on invalid cursors. Foldkit's `PaginatedQuery` also supports stream queries and preserves page ranges when navigating back and forward, avoiding skipped or repeated documents as data changes.

  Stream cursors expose their order-key values. Do not paginate publicly over sensitive indexed fields unless they are pinned with `eq`. All `QueryStream` APIs are experimental.

  ### Middleware options

  Declare a lazy `options` schema on `MiddlewareSpec.MiddlewareSpec`, then pass typed values with `.middleware(Policy, options)` on functions or groups. Options are validated without coercion during codegen and server registration; keep schemas and values client-safe because generated refs carry them.

  The same policy can be attached repeatedly with non-equivalent options. Every attachment runs, with group policies before function policies. Equivalent options and duplicate policies without options are rejected. Register implementations against the same spec used for attachments.

  ### Breaking changes

  Middleware callbacks passed to `MiddlewareImpl.make` or `MiddlewareImpl.makeByFunctionType` receive invocation metadata under `invocation`. To migrate, nest destructuring of `name`, `functionType`, `functionVisibility`, and decoded `args`:

  **Before:**

  ```ts
  (effect, { name, args }) => effect;
  ```

  **After:**

  ```ts
  (effect, { invocation: { name, args } }) => effect;
  ```

  Middleware with an options schema also receives `options` alongside `invocation`; middleware without one keeps its single-argument attachment API and receives only `{ invocation }`.

  ### Fixes and tracing
  - Preserve `ConvexError.data` when a handler throws a `ConvexError` inside an Effect instead of returning it as a typed failure.
  - Add named tracing spans for JavaScript client calls, server function execution, database writes and pagination, `QueryStream.unique`/`QueryStream.paginate`, and `confect codegen`/`confect dev` code-generation passes.

### Patch Changes

- 9f4e2c0: Require `effect@^4.0.0-rc.113` across `@confect/*` and raise `@confect/server`'s optional `@effect/platform-node` peer to the same range. Upgrade Effect alongside Confect; existing Confect call sites are unchanged.

  Effect's own APIs include breaking renames: use `Config.String` instead of `Config.string`, and `LanguageModel.LanguageModel` instead of `LanguageModel.Service` when annotating the result of `AiGatewayLanguageModel.make`. See the [Effect RC 113 release notes](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.113) for the complete migration guidance.

- 90c80e9: Require `effect@^4.0.0-rc.115` across `@confect/*` and `@effect/platform-node@^4.0.0-rc.115` when using `@confect/server`'s optional Node integration. Upgrade these dependencies alongside Confect; existing Confect call sites are unchanged.
- f721d2c: Remove spaces around em dashes and separator slashes in API documentation and `confect codegen` diagnostics.

## 10.0.0-next.21

### Major Changes

- a6425c5: Raise the minimum supported Node.js version to 24.

  ### Breaking Changes
  - `engines.node` is now `>=24` on every `@confect/*` package, raised from `>=22`.

  Node 22 has entered maintenance, so Confect now targets Node 24, the active LTS line. To migrate, move the Node version your project builds and runs on to 24 or later—on Node 22, installing `@confect/*` now fails your package manager's engine check. No API changes accompany the raise: code already running on Node 24 needs no edits.

## 10.0.0-next.20

## 10.0.0-next.19

### Minor Changes

- c1087eb: Add `@confect/foldkit`—client-side bindings for [Foldkit](https://foldkit.dev) apps. The package maps Confect's client surface onto Foldkit's integration seams: `Client.layer` provides the scoped WebSocket client and pagination-session allocator through an application's `resources`, `Subscription.reactiveQuery` builds a subscription entry that opens, re-opens, and closes a reactive query as `Option`-wrapped args derived from the Model change, and `Command.query`/`Command.mutation`/`Command.action` build Command definitions whose args are the ref's args and whose Messages are declared with the same `messages` field Foldkit's own `Command.define` takes. Every failure is folded into a Message via the required `onError` handler, so Command and Subscription error channels stay `never` as Foldkit requires.

  ```ts
  import * as Confect from "@confect/foldkit";
  import * as Schema from "effect/Schema";
  import * as Subscription from "foldkit/subscription";

  const SaveNote = Confect.Command.mutation(
    "SaveNote",
    refs.public.notes.insert,
    {
      messages: [SucceededSaveNote, FailedSaveNote],
      onSuccess: (noteId) => SucceededSaveNote({ noteId }),
      onError: (error) => FailedSaveNote({ message: String(error) }),
    },
  );

  const subscriptions = Subscription.make<
    Model,
    Message,
    Confect.Client.Client
  >()(() => ({
    note: Confect.Subscription.reactiveQuery<Model>()(refs.public.notes.get, {
      args: (model) => Option.map(model.noteId, (noteId) => ({ noteId })),
      onSuccess: (note) => SucceededGetNote({ note }),
      onError: (error) => FailedGetNote({ message: String(error) }),
    }),
  }));
  ```

  The Command factories accept Foldkit's `interrupt` option—`true` keys invocations by the Command name, `{ keyFields, toKey }` by a part derived from the ref's args—and the returned definition gains the `Interrupt` constructor for stopping in-flight invocations. Factory-built definitions instantiate Foldkit's own definition interfaces, so they are accepted wherever Foldkit accepts a Command definition—including Story/Scene `Command.resolve` and `expectExact` matchers. `Command.queryEffect`, `Command.mutationEffect`, and `Command.actionEffect` return execute bodies for hand-written `Command.define` calls (custom args schemas, multi-call Commands), and `Subscription.reactiveQueryStream` is the `dependenciesToStream` escape hatch for hand-written subscription entries.

  `PaginatedQuery` navigates a paginated query one page at a time over Convex's cursor pagination. `PaginatedQuery.make(ref)` returns the Model and settlement schemas. Its states use Foldkit `AsyncData`'s vocabulary and semantics: `Idle`, `Loading`, `Refreshing`, `Success`, `Failure`, and `Stale`. Failed settlements preserve the complete error contract: declared function and middleware errors are wrapped as `FunctionError`, Convex's invalid-cursor pseudo-error is normalized to the new `@confect/core/PaginationError.InvalidCursor`, and `WebSocketClientError` and `SchemaError` are carried directly. `settle` accepts a request-bound `Result`, turns a failed refresh into `Stale`, automatically resets an invalid cursor, and ignores successes or failures from superseded requests. All machine operations (`init`, `reinitialize`, `reset`, `close`, `next`, `prev`, and `first`) remain pure.

  `Subscription.paginatedQuery` keeps exactly one live, reactive page subscription in sync with the machine and emits one `onSettled` Message shape for either outcome. It allocates Convex's pagination `id` internally and returns it with the first settlement, so session allocation is not a separate Command or application Message. Installing that id is keep-alive-equivalent and does not restart the subscription. Query errors are emitted as values without closing the underlying Convex subscription, allowing a later successful result to recover naturally. Each request supports `maximumRowsRead` and `maximumBytesRead` and uses `initialNumItems` for the initial page and split heuristic. Page splits remain transparent, the last complete page stays visible during navigation and after refresh failure, and an empty terminal page automatically retreats to the preceding page.

  ```ts
  const Notes = Confect.PaginatedQuery.make(refs.public.notes.paginate);

  // Model: notes: Notes.schema
  // Initial Model value: notes: Notes.idle
  // Message: settlement: Notes.settlement
  // update after matching Idle: Notes.init(idle, { channel }, { initialNumItems: 20 })

  const subscriptions = Subscription.make<
    Model,
    Message,
    Confect.Client.Client
  >()(() => ({
    notesPage: Confect.Subscription.paginatedQuery<Model>()(Notes, {
      state: (model) => model.notes,
      onSettled: (settlement) => SettledGetNotesPage({ settlement }),
    }),
  }));
  ```
