import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, flow, Layer, Option } from "effect";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageActionWriter: ConvexStorageActionWriter) => ({
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () => Effect.fail(new BlobNotFoundError({ id: storageId })),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
  store: (blob: Blob, options?: { sha256?: string }) =>
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

export class StorageActionWriter extends Context.Service<
  StorageActionWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageActionWriter") {
  static readonly layer = (storageActionWriter: ConvexStorageActionWriter) =>
    Layer.succeed(this, make(storageActionWriter));
}
