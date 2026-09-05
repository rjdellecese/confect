# @confect/foldkit

## 10.0.0-next.22

### Minor Changes

- e7ef4a5: `PaginatedQuery.next` now pins the page it leaves to the range it displayed, so `PaginatedQuery.prev` reloads exactly that range — from the page's cursor to its continuation cursor — rather than the first `initialNumItems` documents after its cursor. Going back and forward no longer skips or repeats documents when the data has changed in between.

  This also makes the machine work with paginated queries built on `QueryStream.paginate`, which have no query journal to remember page ranges.

## 10.0.0-next.21

### Major Changes

- a6425c5: Raise the minimum supported Node.js version to 24.

  ### Breaking Changes
  - `engines.node` is now `>=24` on every `@confect/*` package, raised from `>=22`.

  Node 22 has entered maintenance, so Confect now targets Node 24, the active LTS line. To migrate, move the Node version your project builds and runs on to 24 or later — on Node 22, installing `@confect/*` now fails your package manager's engine check. No API changes accompany the raise: code already running on Node 24 needs no edits.

## 10.0.0-next.20

## 10.0.0-next.19

### Minor Changes

- c1087eb: Add `@confect/foldkit` — client-side bindings for [Foldkit](https://foldkit.dev) apps. The package maps Confect's client surface onto Foldkit's integration seams: `Client.layer` provides the scoped WebSocket client and pagination-session allocator through an application's `resources`, `Subscription.reactiveQuery` builds a subscription entry that opens, re-opens, and closes a reactive query as `Option`-wrapped args derived from the Model change, and `Command.query` / `Command.mutation` / `Command.action` build Command definitions whose args are the ref's args and whose Messages are declared with the same `messages` field Foldkit's own `Command.define` takes. Every failure is folded into a Message via the required `onError` handler, so Command and Subscription error channels stay `never` as Foldkit requires.

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

  The Command factories accept Foldkit's `interrupt` option — `true` keys invocations by the Command name, `{ keyFields, toKey }` by a part derived from the ref's args — and the returned definition gains the `Interrupt` constructor for stopping in-flight invocations. Factory-built definitions instantiate Foldkit's own definition interfaces, so they are accepted wherever Foldkit accepts a Command definition — including Story/Scene `Command.resolve` and `expectExact` matchers. `Command.queryEffect`, `Command.mutationEffect`, and `Command.actionEffect` return execute bodies for hand-written `Command.define` calls (custom args schemas, multi-call Commands), and `Subscription.reactiveQueryStream` is the `dependenciesToStream` escape hatch for hand-written subscription entries.

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
