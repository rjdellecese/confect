---
"@confect/foldkit": minor
---

Add `@confect/foldkit` — client-side bindings for [Foldkit](https://foldkit.dev) apps. The package maps Confect's client surface onto Foldkit's integration seams: `WebSocketClient.layer` plugs into an application's `resources`, `Subscription.reactiveQuery` builds a subscription entry that opens, re-opens, and closes a reactive query as `Option`-wrapped args derived from the Model change, and `Command.query` / `Command.mutation` / `Command.action` build Command definitions whose args are the ref's args. Every failure is folded into a Message via the required `onError` handler, so Command and Subscription error channels stay `never` as Foldkit requires.

```ts
import { Command, Subscription, WebSocketClient } from "@confect/foldkit";

const SaveNote = Command.mutation("SaveNote", refs.public.notes.insert, {
  onSuccess: (noteId) => SucceededSaveNote({ noteId }),
  onError: (error) => FailedSaveNote({ message: String(error) }),
});

const subscriptions = FoldkitSubscription.make<
  Model,
  Message,
  WebSocketClient.WebSocketClient
>()(() => ({
  note: Subscription.reactiveQuery(refs.public.notes.get, {
    args: (model: Model) => Option.map(model.noteId, (noteId) => ({ noteId })),
    onSuccess: (note) => GotNote({ note }),
    onError: (error) => FailedGetNote({ message: String(error) }),
  }),
}));
```

`Command.queryEffect`, `Command.mutationEffect`, and `Command.actionEffect` return execute bodies for hand-written `Command.define` calls (custom args schemas, `interrupt`), and `Subscription.reactiveQueryStream` is the `dependenciesToStream` escape hatch for hand-written subscription entries.
