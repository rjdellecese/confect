import { Effect, Schema } from "effect";
import { Id } from "~/src/server/schemas/Id";
import {
  action,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "~/test/convex/confect";

export const confectStorageReaderGetUrl = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.URL,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storageReader = yield* ConfectStorageReader;

      return yield* storageReader.getUrl(id);
    }),
});

export const confectStorageWriterGenerateUploadUrl = action({
  args: Schema.Struct({}),
  returns: Schema.URL,
  handler: () =>
    Effect.gen(function* () {
      const storage = yield* ConfectStorageWriter;

      return yield* storage.generateUploadUrl();
    }),
});

export const confectStorageWriterDelete = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Null,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storage = yield* ConfectStorageWriter;

      yield* storage.delete(id);

      return null;
    }),
});

export const confectStorageActionWriterGet = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.NonNegative,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storageActionWriter = yield* ConfectStorageActionWriter;

      const file = yield* storageActionWriter.get(id);

      return file.size;
    }),
});

export const confectStorageActionWriterStore = action({
  args: Schema.Struct({
    text: Schema.String,
    options: Schema.optional(
      Schema.Struct({
        sha256: Schema.optional(Schema.String),
      }),
    ),
  }),
  returns: Id("_storage"),
  handler: ({ text, options }) =>
    Effect.gen(function* () {
      const storageActionWriter = yield* ConfectStorageActionWriter;

      const blob = new Blob([text]);

      return yield* storageActionWriter.store(blob, options);
    }),
});
