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
   * Effect that creates a temporary upload URL in a mutation, action, or HTTP
   * handler. Yield `generateUploadUrl` without calling it. An invalid URL or
   * Convex failure is a defect.
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
   * Deletes a stored blob in a mutation, action, or HTTP handler.
   *
   * @category Writing
   *
   * @param storageId - ID of the blob to delete.
   *
   * @returns An Effect that completes without a value. Any Convex rejection
   *   becomes {@link BlobNotFoundError}.
   */
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => BlobNotFoundError.make({ id: storageId }),
    }),
});

/**
 * Compatibility tag for creating upload URLs and deleting blobs in mutations,
 * actions, and HTTP handlers. Use the generated `Storage` tag in new code.
 *
 * @category Tags
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
