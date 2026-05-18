import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer, pipe, Schema } from "effect";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageWriter: ConvexStorageWriter) => ({
  generateUploadUrl: () =>
    Effect.promise(() => storageWriter.generateUploadUrl()).pipe(
      Effect.andThen((url) =>
        pipe(url, Schema.decodeEffect(Schema.URLFromString), Effect.orDie),
      ),
    ),
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => new BlobNotFoundError({ id: storageId }),
    }),
});

export class StorageWriter extends Context.Service<
  StorageWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageWriter") {
  static readonly layer = (storageWriter: ConvexStorageWriter) =>
    Layer.succeed(this, make(storageWriter));
}
