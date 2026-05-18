import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, flow, Layer, Option, pipe, Schema } from "effect";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageReader: ConvexStorageReader) => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () => Effect.fail(new BlobNotFoundError({ id: storageId })),
            onSome: (doc) =>
              pipe(
                doc,
                Schema.decodeEffect(Schema.URLFromString),
                Effect.orDie,
              ),
          }),
        ),
      ),
    ),
});

export class StorageReader extends Context.Service<
  StorageReader,
  ReturnType<typeof make>
>()("@confect/server/StorageReader") {
  static readonly layer = (storageReader: ConvexStorageReader) =>
    Layer.succeed(this, make(storageReader));
}
