---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.105` (from `^4.0.0-beta.102`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

`beta.103` separates wall-clock time from monotonic elapsed time: `Clock.Clock` now also requires `monotonicTimeNanos` and `monotonicTimeNanosUnsafe`, so a custom `Clock` provided to a Confect function has to supply both. Effects that measure elapsed time — `Effect.timed`, duration metrics, `Sink.withDuration` — read the monotonic accessors instead of the wall clock, and continue to report a zero duration inside queries and mutations, where Confect pins the unsafe accessors to constants to keep Convex's query cache from evicting on every logged span.

`beta.103` also moves synchronous Effect runs off `setImmediate`/`setTimeout` and onto the microtask queue, which Convex's query and mutation isolate permits. Confect no longer suppresses cooperative fiber yielding for the synchronous work it performs while your modules load — registration and schema-to-validator compilation — and relies on that scheduling instead. Neither the "Can't use `setTimeout` in queries and mutations" crash nor any other consumer-visible behavior changes, but this is the area to look at if module loading starts misbehaving.

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

`Schema.ErrorClass` is likewise now `Schema.Error`; the schema for JavaScript `Error` instances that previously went by `Schema.Error` is now `Schema.ErrorInstance`, and `Schema.ErrorReviver` is now `Schema.ErrorInstanceReviver`. Confect's own error types — `DocumentDecodeError`, `BlobNotFoundError`, and the rest — are unchanged in name, shape, and message.

`beta.105` restructures how schema validation failures are reported, but not on the path Confect puts you on: decode and encode failures still surface as `Schema.SchemaError` with a formatted `message`, so error text from `@confect/js`, `@confect/react`, and document decoding is unchanged.
