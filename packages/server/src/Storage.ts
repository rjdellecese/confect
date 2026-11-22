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
     * Reads the download URL for a stored blob in any function context.
     *
     * @category Reading
     *
     * @param storageId - ID in the `_storage` table.
     *
     * @returns An Effect producing a `URL`, or failing with `BlobNotFoundError`
     *   if no URL exists. An invalid URL or unexpected Convex failure is a
     *   defect.
     */
    getUrl: reader.getUrl,
    /**
     * Effect that creates a temporary upload URL in a mutation, action, or HTTP
     * handler. Yield `storage.generateUploadUrl` without calling it. An invalid
     * URL or Convex failure is a defect.
     *
     * @category Writing
     */
    generateUploadUrl: Effect.flatMap(
      StorageWriter,
      (writer) => writer.generateUploadUrl,
    ),
    /**
     * Deletes a stored blob in a mutation, action, or HTTP handler.
     *
     * @category Writing
     *
     * @param storageId - ID of the blob to delete.
     *
     * @returns An Effect that completes without a value. Any Convex rejection
     *   becomes `BlobNotFoundError`.
     */
    delete: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageWriter, (writer) => writer.delete(storageId)),
    /**
     * Reads the contents of a stored blob in a mutation, action, or HTTP
     * handler.
     *
     * @category Reading
     *
     * @param storageId - ID of the blob to read.
     *
     * @returns An Effect producing a `Blob`, or failing with
     *   `BlobNotFoundError` if none exists. A Convex rejection is a defect.
     */
    get: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageActionWriter, (writer) => writer.get(storageId)),
    /**
     * Stores a blob in a mutation, action, or HTTP handler and returns its
     * storage ID.
     *
     * @category Writing
     *
     * @param blob - Contents and media type to store.
     * @param options - Optional `sha256` checksum for Convex to verify.
     *
     * @returns An Effect producing an ID in `_storage`. A Convex rejection is a
     *   defect.
     */
    store: (blob: Blob, options?: { sha256?: string }) =>
      Effect.flatMap(StorageActionWriter, (writer) =>
        writer.store(blob, options),
      ),
  };
});

/**
 * Tag for working with Convex file storage. Yield the application's generated
 * `Storage` tag in any function context; Confect provides the services required
 * by each operation.
 *
 * **Gotchas**
 *
 * Queries can read download URLs but cannot read blob contents. Creating upload
 * URLs, deleting blobs, and reading or storing blob contents require a
 * mutation, action, or HTTP handler.
 *
 * @category Tags
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
