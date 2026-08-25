---
"@confect/foldkit": minor
---

Add `@confect/foldkit` — client-side bindings for [Foldkit](https://foldkit.dev) apps. The package maps Confect's client surface onto Foldkit's integration seams: `WebSocketClient.layer` plugs into an application's `resources`, `Subscription.reactiveQuery` builds a subscription entry that opens, re-opens, and closes a reactive query as `Option`-wrapped args derived from the Model change, and `Command.query` / `Command.mutation` / `Command.action` build Command definitions whose args are the ref's args and whose Messages are declared with the same `messages` field Foldkit's own `Command.define` takes. Every failure is folded into a Message via the required `onError` handler, so Command and Subscription error channels stay `never` as Foldkit requires.

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
  Confect.WebSocketClient.WebSocketClient
>()(() => ({
  note: Confect.Subscription.reactiveQuery<Model>()(refs.public.notes.get, {
    args: (model) => Option.map(model.noteId, (noteId) => ({ noteId })),
    onSuccess: (note) => SucceededGetNote({ note }),
    onError: (error) => FailedGetNote({ message: String(error) }),
  }),
}));
```

The Command factories accept Foldkit's `interrupt` option — `true` keys invocations by the Command name, `{ keyFields, toKey }` by a part derived from the ref's args — and the returned definition gains the `Interrupt` constructor for stopping in-flight invocations. Factory-built definitions instantiate Foldkit's own definition interfaces, so they are accepted wherever Foldkit accepts a Command definition — including Story/Scene `Command.resolve` and `expectExact` matchers. `Command.queryEffect`, `Command.mutationEffect`, and `Command.actionEffect` return execute bodies for hand-written `Command.define` calls (custom args schemas, multi-call Commands), and `Subscription.reactiveQueryStream` is the `dependenciesToStream` escape hatch for hand-written subscription entries.

`PaginatedQuery` navigates a paginated query one page at a time over Convex's cursor pagination. `PaginatedQuery.make(ref, errorSchema)` returns the Model schema, a correlated settlement schema, `init`, and `reinitialize`. Its phases use Foldkit `AsyncData`'s vocabulary and semantics: `Loading`, `Refreshing`, `Success`, `Failure`, and `Stale`. `settle` accepts a request-bound `Result`, turns a failed refresh into `Stale`, and ignores successes or failures from superseded requests. Transitions include `next`, `prev`, `first`, `retry`, and `reset`; view accessors include `getPage`, `getItems`, `getError`, refinements for every phase, and unambiguous displayed/target page numbers.

`Subscription.paginatedQuery` keeps exactly one live, reactive page subscription in sync with the machine and emits one `onSettled` Message shape for either outcome. Each request sends Convex's pagination `id`, supports `maximumRowsRead` and `maximumBytesRead`, and uses `initialNumItems` for the initial page and split heuristic. Page splits remain transparent, the last complete page stays visible during navigation and after refresh failure, and an empty terminal page automatically retreats to the preceding page.

```ts
const Notes = Confect.PaginatedQuery.make(
  refs.public.notes.paginate,
  Schema.String,
);

// Model: notes: Schema.Option(Notes.schema)
// Message: settlement: Notes.settlement
// init:  Option.some(Notes.init({ channel }, { initialNumItems: 20 }))
// update: Confect.PaginatedQuery.settle(message.settlement), Confect.PaginatedQuery.next(state), ...

const subscriptions = Subscription.make<
  Model,
  Message,
  Confect.WebSocketClient.WebSocketClient
>()(() => ({
  notesPage: Confect.Subscription.paginatedQuery<Model>()(Notes, {
    state: (model) => model.notes,
    mapError: String,
    onSettled: (settlement) => SettledGetNotesPage({ settlement }),
  }),
}));
```
