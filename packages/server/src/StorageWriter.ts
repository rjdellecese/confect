import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { Effect, Layer, pipe, Schema } from "effect";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageWriter: ConvexStorageWriter) => ({
  generateUploadUrl: () =>
    Effect.promise(() => storageWriter.generateUploadUrl()).pipe(
      Effect.andThen((url) =>
        pipe(url, Schema.decode(Schema.URL), Effect.orDie),
      ),
    ),
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => new BlobNotFoundError({ id: storageId }),
    }),
});

export class StorageWriter extends Effect.Tag("@confect/server/StorageWriter")<
  StorageWriter,
  ReturnType<typeof make>
>() {
  static readonly layer = (storageWriter: ConvexStorageWriter) =>
    Layer.succeed(this, make(storageWriter));
}
