---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.104` (from `^4.0.0-beta.103`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

`beta.104` renames Effect's schema-backed error constructors, which appear in any function spec that declares an `error` schema. `Schema.TaggedErrorClass` is now `Schema.TaggedError`, and the untagged `Schema.ErrorClass` is now `Schema.Error`. The call signatures are unchanged, so upgrading is a rename in your own spec files:

Before:

```ts
export class NoteNotFound extends Schema.TaggedErrorClass<NoteNotFound>()(
  "NoteNotFound",
  { noteId: Id("notes") },
) {}
```

After:

```ts
export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
  "NoteNotFound",
  { noteId: Id("notes") },
) {}
```

Two related names moved as well, if you use them alongside your Confect schemas: the schema that accepts a plain JavaScript `Error` is now `Schema.ErrorInstance`, and its reviver is now `Schema.ErrorInstanceReviver`.
