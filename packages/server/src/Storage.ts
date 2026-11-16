import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { StorageActionWriter } from "./StorageActionWriter";
import { StorageReader } from "./StorageReader";
import { StorageWriter } from "./StorageWriter";

const make = Effect.gen(function* () {
  const reader = yield* StorageReader;
  return {
    /**
     * Get a blob's download URL. Available in every function context.
     *
     * @category Reading
     *
     * @param storageId - ID in the `_storage` table.
     *
     * @returns An Effect producing a URL, failing with BlobNotFoundError if the
     *   blob has no download URL. Unexpected native failures are defects.
     */
    getUrl: reader.getUrl,
    /**
     * Effect producing a temporary upload URL. Available in mutations, actions
     * and HTTP handlers; it is a property, not a method call. Native failures
     * and invalid returned URLs are defects.
     *
     * @category Writing
     */
    generateUploadUrl: Effect.flatMap(
      StorageWriter,
      (writer) => writer.generateUploadUrl,
    ),
    /**
     * Delete a stored blob in a mutation, action or HTTP handler.
     *
     * @category Writing
     *
     * @param storageId - ID of the blob to delete.
     *
     * @returns An Effect producing void; native rejection becomes
     *   BlobNotFoundError.
     */
    delete: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageWriter, (writer) => writer.delete(storageId)),
    /**
     * Read blob contents in a mutation, action or HTTP handler.
     *
     * @category Reading
     *
     * @param storageId - ID of the stored blob.
     *
     * @returns An Effect producing a Blob, failing with BlobNotFoundError if
     *   absent. Unexpected native failures are defects.
     */
    get: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageActionWriter, (writer) => writer.get(storageId)),
    /**
     * Store blob contents in a mutation, action or HTTP handler.
     *
     * @category Writing
     *
     * @param blob - Contents and media type to store.
     * @param options - Optional `sha256` checksum checked by Convex.
     *
     * @returns An Effect producing the `_storage` ID. Native failures are
     *   defects.
     */
    store: (blob: Blob, options?: { sha256?: string }) =>
      Effect.flatMap(StorageActionWriter, (writer) =>
        writer.store(blob, options),
      ),
  };
});

/**
 * Unified storage service obtained from the application's generated `Storage`
 * tag. Individual operations require the context described on each member;
 * Confect supplies the required reader/writer services automatically.
 *
 * @category Services
 */
export class Storage extends Context.Service<
  Storage,
  Effect.Success<typeof make>
>()("@confect/server/Storage") {}

/**
 * @internal
 */
export const layer = (storageReader: ConvexStorageReader) =>
  Layer.effect(Storage, make).pipe(
    Layer.provideMerge(StorageReader.layer(storageReader)),
  );
