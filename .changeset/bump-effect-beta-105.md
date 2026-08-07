---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.105` (from `^4.0.0-beta.103`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

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
