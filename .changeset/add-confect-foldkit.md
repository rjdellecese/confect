---
"@confect/foldkit": minor
---

Add `@confect/foldkit` — client-side bindings for [Foldkit](https://foldkit.dev) apps. The package maps Confect's client surface onto Foldkit's integration seams: `WebSocketClient.layer` plugs into an application's `resources`, `Subscription.reactiveQuery` builds a subscription entry that opens, re-opens, and closes a reactive query as `Option`-wrapped args derived from the Model change, and `Command.query` / `Command.mutation` / `Command.action` build Command definitions whose args are the ref's args and whose Messages are declared with the same `messages` field Foldkit's own `Command.define` takes. Every failure is folded into a Message via the required `onError` handler, so Command and Subscription error channels stay `never` as Foldkit requires.

```ts
import { Command, Subscription, WebSocketClient } from "@confect/foldkit";

const SaveNote = Command.mutation("SaveNote", refs.public.notes.insert, {
  messages: [SucceededSaveNote, FailedSaveNote],
  onSuccess: (noteId) => SucceededSaveNote({ noteId }),
  onError: (error) => FailedSaveNote({ message: String(error) }),
});

const subscriptions = FoldkitSubscription.make<
  Model,
  Message,
  WebSocketClient.WebSocketClient
>()(() => ({
  note: Subscription.reactiveQuery<Model>()(refs.public.notes.get, {
    args: (model) => Option.map(model.noteId, (noteId) => ({ noteId })),
    onSuccess: (note) => GotNote({ note }),
    onError: (error) => FailedGetNote({ message: String(error) }),
  }),
}));
```

The Command factories accept Foldkit's `interrupt` option — `true` keys invocations by the Command name, `{ keyFields, toKey }` by a part derived from the ref's args — and the returned definition gains the `Interrupt` constructor for stopping in-flight invocations. Factory-built definitions instantiate Foldkit's own definition interfaces, so they are accepted wherever Foldkit accepts a Command definition — including Story/Scene `Command.resolve` and `expectExact` matchers. `Command.queryEffect`, `Command.mutationEffect`, and `Command.actionEffect` return execute bodies for hand-written `Command.define` calls (custom args schemas, multi-call Commands), and `Subscription.reactiveQueryStream` is the `dependenciesToStream` escape hatch for hand-written subscription entries.

`PaginatedQuery` navigates a paginated query one page at a time (next/previous) over Convex's cursor pagination: `PaginatedQuery.make(ref)` returns the machine's Model schema and `init` constructor, the pure transitions `next`, `prev`, `settle`, `fail`, `retry`, and `reset` drive it from `update`, and view accessors (`page`, `pageNum`, `canNext`, `canPrev`, `isFirst`, `isLast`, `match`, …) read it. `Subscription.paginatedQuery` keeps exactly one live, reactive page subscription in sync with the machine state. Page splits are handled transparently (the current page re-pins and reloads as a range query), the last loaded page stays visible while the next one loads, and `PaginatedQuery.isInvalidCursor` identifies the error whose recovery is `reset`.

```ts
const Notes = PaginatedQuery.make(refs.public.notes.paginate);

// Model: notes: Schema.Option(Notes.schema)
// init:  Option.some(Notes.init({ channel }, { numItems: 20 }))
// update: PaginatedQuery.settle(message.result), PaginatedQuery.next(state), ...

const subscriptions = FoldkitSubscription.make<
  Model,
  Message,
  WebSocketClient.WebSocketClient
>()(() => ({
  notesPage: Subscription.paginatedQuery(refs.public.notes.paginate, {
    state: (model: Model) => model.notes,
    onResult: (result) => SettledNotesPage({ result }),
    onError: (error) => FailedNotesPage({ error }),
  }),
}));
```
