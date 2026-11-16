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
   * Resolve a stored blob's download URL.
   *
   * @param storageId - ID in `_storage`.
   *
   * @returns An Effect producing a URL or failing with BlobNotFoundError when
   *   absent. Native failures and invalid returned URLs are defects.
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
 * Compatibility storage reader supplied by Confect in all function contexts.
 * New code should use the generated unified `Storage` tag instead.
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
