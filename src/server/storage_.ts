import type {
  StorageActionWriter,
  StorageReader,
  StorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Effect, Layer, Option } from "effect";

const makeStorageReader = (storageReader: StorageReader) => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    // TODO: Which errors might occur?
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.map(Option.fromNullable),
    ),
});

const makeStorageWriter = (storageWriter: StorageWriter) => ({
  generateUploadUrl: () =>
    // TODO: Which errors might occur?
    Effect.promise(() => storageWriter.generateUploadUrl()),
  delete: (storageId: GenericId<"_storage">) =>
    // TODO: Can this throw?
    Effect.promise(() => storageWriter.delete(storageId)),
});

const makeStorageActionWriter = (storageActionWriter: StorageActionWriter) => ({
  get: (storageId: GenericId<"_storage">) =>
    // TODO: Which errors might occur?
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.map(Option.fromNullable),
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
