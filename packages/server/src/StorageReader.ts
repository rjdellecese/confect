import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import { flow, pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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
