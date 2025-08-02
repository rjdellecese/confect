import type {
  StorageActionWriter,
  StorageReader,
  StorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Effect, flow, Layer, Option, pipe, Schema } from "effect";

const makeStorageReader = (storageReader: StorageReader) => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullable,
          Option.match({
            onNone: () => Effect.fail(new FileNotFoundError({ id: storageId })),
            onSome: (doc) => pipe(doc, Schema.decode(Schema.URL), Effect.orDie),
          }),
        ),
      ),
    ),
});

const makeStorageWriter = (storageWriter: StorageWriter) => ({
  generateUploadUrl: () =>
    Effect.promise(() => storageWriter.generateUploadUrl()).pipe(
      Effect.andThen((url) =>
        pipe(url, Schema.decode(Schema.URL), Effect.orDie),
      ),
    ),
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => new FileNotFoundError({ id: storageId }),
    }),
});

const makeStorageActionWriter = (storageActionWriter: StorageActionWriter) => ({
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullable,
          Option.match({
            onNone: () => Effect.fail(new FileNotFoundError({ id: storageId })),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
  store: (blob: Blob, options?: { sha256?: string }) =>
    // TODO: Which errors might occur?
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

export class ConfectStorageReader extends Effect.Tag(
  "@rjdellecese/confect/ConfectStorageReader",
)<ConfectStorageReader, ReturnType<typeof makeStorageReader>>() {
  static readonly layer = (storageReader: StorageReader) =>
    Layer.succeed(this, makeStorageReader(storageReader));
}

export class ConfectStorageWriter extends Effect.Tag(
  "@rjdellecese/confect/ConfectStorageWriter",
)<ConfectStorageWriter, ReturnType<typeof makeStorageWriter>>() {
  static readonly layer = (storageWriter: StorageWriter) =>
    Layer.succeed(this, makeStorageWriter(storageWriter));
}

export class ConfectStorageActionWriter extends Effect.Tag(
  "@rjdellecese/confect/ConfectStorageActionWriter",
)<ConfectStorageActionWriter, ReturnType<typeof makeStorageActionWriter>>() {
  static readonly layer = (storageActionWriter: StorageActionWriter) =>
    Layer.succeed(this, makeStorageActionWriter(storageActionWriter));
}

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>(
  "FileNotFoundError",
)("FileNotFoundError", {
  id: Schema.String,
}) {
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
