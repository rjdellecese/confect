import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow, pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";
// oxlint-disable-next-line import/no-unassigned-import
import "./internal/urlCanParsePolyfill";

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
                Schema.decodeUnknownEffect(Schema.URLFromString),
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
