import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { BlobNotFoundError } from "./BlobNotFoundError";

const make = (storageActionWriter: ConvexStorageActionWriter) => ({
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullable,
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

export class StorageActionWriter extends Effect.Tag(
  "@confect/server/StorageActionWriter",
)<StorageActionWriter, ReturnType<typeof make>>() {
  static readonly layer = (storageActionWriter: ConvexStorageActionWriter) =>
    Layer.succeed(this, make(storageActionWriter));
}
