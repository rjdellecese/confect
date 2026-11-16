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
   * Read stored contents in a mutation, action or HTTP handler.
   *
   * @param storageId - ID of the blob.
   *
   * @returns An Effect producing a Blob, failing with BlobNotFoundError when
   *   absent. Native rejections are defects.
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
   * Store contents in a mutation, action or HTTP handler.
   *
   * @param blob - Contents and media type.
   * @param options - Optional `sha256` checksum checked by Convex.
   *
   * @returns An Effect producing the `_storage` ID; native rejections are
   *   defects.
   */
  store: (blob: Blob, options?: { sha256?: string }) =>
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

/**
 * Compatibility blob-content service supplied in mutations, actions and HTTP
 * handlers despite its historical name. Prefer the generated `Storage` tag.
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
