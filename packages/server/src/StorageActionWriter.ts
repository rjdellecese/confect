import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageActionWriter: ConvexStorageActionWriter) => ({
  /**
   * Reads a stored blob's contents in a mutation, action, or HTTP handler.
   *
   * @category Reading
   *
   * @param storageId - ID of the blob to read.
   *
   * @returns An Effect producing a `Blob`, or failing with
   *   {@link BlobNotFoundError} if none exists. A Convex rejection is a
   *   defect.
   */
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () =>
              Effect.fail(BlobNotFoundError.make({ id: storageId })),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
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
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

/**
 * Compatibility tag for reading and storing blob contents. Despite the name,
 * Confect supplies the service in mutations as well as actions and HTTP
 * handlers. Use the generated `Storage` tag in new code.
 *
 * @category Tags
 */
export class StorageActionWriter extends Context.Service<
  StorageActionWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageActionWriter") {
  /**
   * @internal
   */
  static readonly layer = (storageActionWriter: ConvexStorageActionWriter) =>
    Layer.succeed(this, make(storageActionWriter));
}
