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
  handler: ({ id }) => ConfectStorageReader.getUrl(id),
});

export const confectStorageWriterGenerateUploadUrl = action({
  args: Schema.Struct({}),
  returns: Schema.URL,
  handler: () => ConfectStorageWriter.generateUploadUrl(),
});

export const confectStorageWriterDelete = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Null,
  handler: ({ id }) => ConfectStorageWriter.delete(id).pipe(Effect.as(null)),
});

export const confectStorageActionWriterGet = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.NonNegative,
  handler: ({ id }) =>
    ConfectStorageActionWriter.get(id).pipe(Effect.map((file) => file.size)),
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
    ConfectStorageActionWriter.store(new Blob([text]), options),
});
