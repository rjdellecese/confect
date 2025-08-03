import { Effect, Schema } from 'effect';
import { GenericId } from '../../src/server/schemas/GenericId';
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  confectAction,
} from './confect';

export const confectStorageReaderGetUrl = confectAction({
  args: Schema.Struct({
    id: GenericId('_storage'),
  }),
  returns: Schema.URL,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storageReader = yield* ConfectStorageReader;

      return yield* storageReader.getUrl(id);
    }),
});

export const confectStorageWriterGenerateUploadUrl = confectAction({
  args: Schema.Struct({}),
  returns: Schema.URL,
  handler: () =>
    Effect.gen(function* () {
      const storage = yield* ConfectStorageWriter;

      return yield* storage.generateUploadUrl();
    }),
});

export const confectStorageWriterDelete = confectAction({
  args: Schema.Struct({
    id: GenericId('_storage'),
  }),
  returns: Schema.Null,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storage = yield* ConfectStorageWriter;

      yield* storage.delete(id);

      return null;
    }),
});

export const confectStorageActionWriterGet = confectAction({
  args: Schema.Struct({
    id: GenericId('_storage'),
  }),
  returns: Schema.NonNegative,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const storageActionWriter = yield* ConfectStorageActionWriter;

      const file = yield* storageActionWriter.get(id);

      return file.size;
    }),
});

export const confectStorageActionWriterStore = confectAction({
  args: Schema.Struct({
    text: Schema.String,
    options: Schema.optional(
      Schema.Struct({
        sha256: Schema.optional(Schema.String),
      }),
    ),
  }),
  returns: GenericId('_storage'),
  handler: ({ text, options }) =>
    Effect.gen(function* () {
      const storageActionWriter = yield* ConfectStorageActionWriter;

      const blob = new Blob([text]);

      return yield* storageActionWriter.store(blob, options);
    }),
});
