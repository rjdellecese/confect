import type {
  StorageActionWriter as ConvexStorageActionWriter,
  StorageReader as ConvexStorageReader,
  StorageWriter as ConvexStorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Effect, flow, Layer, Option, pipe, Schema } from "effect";

const makeStorageReader = (storageReader: ConvexStorageReader) => ({
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

const makeStorageWriter = (storageWriter: ConvexStorageWriter) => ({
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

const makeStorageActionWriter = (
  storageActionWriter: ConvexStorageActionWriter,
) => ({
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
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

export class StorageReader extends Effect.Tag(
  "@confect/server/Storage/StorageReader",
)<StorageReader, ReturnType<typeof makeStorageReader>>() {
  static readonly layer = (storageReader: ConvexStorageReader) =>
    Layer.succeed(this, makeStorageReader(storageReader));
}

export class StorageWriter extends Effect.Tag(
  "@confect/server/Storage/StorageWriter",
)<StorageWriter, ReturnType<typeof makeStorageWriter>>() {
  static readonly layer = (storageWriter: ConvexStorageWriter) =>
    Layer.succeed(this, makeStorageWriter(storageWriter));
}

export class StorageActionWriter extends Effect.Tag(
  "@confect/server/Storage/StorageActionWriter",
)<StorageActionWriter, ReturnType<typeof makeStorageActionWriter>>() {
  static readonly layer = (storageActionWriter: ConvexStorageActionWriter) =>
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
