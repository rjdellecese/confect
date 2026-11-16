import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageWriter: ConvexStorageWriter) => ({
  /**
   * Effect producing a temporary upload URL in mutations, actions and HTTP
   * handlers. Native failures and invalid URL decoding are defects.
   *
   * @category Writing
   */
  generateUploadUrl: Effect.promise(() =>
    storageWriter.generateUploadUrl(),
  ).pipe(
    Effect.andThen((url) =>
      pipe(
        url,
        Schema.decodeEffect(Schema.URLFromString),
        Effect.catchTag("SchemaError", Effect.die),
      ),
    ),
  ),
  /**
   * Delete a blob in a writable storage context.
   *
   * @category Writing
   *
   * @param storageId - ID of the stored blob.
   *
   * @returns An Effect producing void; native rejection becomes
   *   BlobNotFoundError.
   */
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => BlobNotFoundError.make({ id: storageId }),
    }),
});

/**
 * Compatibility upload/delete service supplied in mutations, actions and HTTP
 * handlers. New code should use the generated unified `Storage` tag instead.
 *
 * @category Services
 */
export class StorageWriter extends Context.Service<
  StorageWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageWriter") {
  /**
   * @internal
   */
  static readonly layer = (storageWriter: ConvexStorageWriter) =>
    Layer.succeed(this, make(storageWriter));
}
