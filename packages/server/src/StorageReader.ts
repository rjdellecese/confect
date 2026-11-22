import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow, pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageReader: ConvexStorageReader) => ({
  /**
   * Reads a stored blob's download URL without fetching its contents.
   *
   * @category Reading
   *
   * @param storageId - ID in the `_storage` table.
   *
   * @returns An Effect producing a `URL`, or failing with
   *   {@link BlobNotFoundError} if no URL exists. An invalid URL or Convex
   *   rejection is a defect.
   */
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () =>
              Effect.fail(BlobNotFoundError.make({ id: storageId })),
            onSome: (doc) =>
              pipe(
                doc,
                Schema.decodeEffect(Schema.URLFromString),
                Effect.catchTag("SchemaError", Effect.die),
              ),
          }),
        ),
      ),
    ),
});

/**
 * Compatibility tag for reading blob download URLs in any function context. Use
 * the generated `Storage` tag in new code.
 *
 * @category Tags
 */
export class StorageReader extends Context.Service<
  StorageReader,
  ReturnType<typeof make>
>()("@confect/server/StorageReader") {
  /**
   * @internal
   */
  static readonly layer = (storageReader: ConvexStorageReader) =>
    Layer.succeed(this, make(storageReader));
}
