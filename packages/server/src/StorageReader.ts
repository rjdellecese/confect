import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import { Effect, flow, Layer, Option, pipe, Schema } from "effect";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageReader: ConvexStorageReader) => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullable,
          Option.match({
            onNone: () => Effect.fail(new BlobNotFoundError({ id: storageId })),
            onSome: (doc) => pipe(doc, Schema.decode(Schema.URL), Effect.orDie),
          }),
        ),
      ),
    ),
});

export class StorageReader extends Effect.Tag("@confect/server/StorageReader")<
  StorageReader,
  ReturnType<typeof make>
>() {
  static readonly layer = (storageReader: ConvexStorageReader) =>
    Layer.succeed(this, make(storageReader));
}
