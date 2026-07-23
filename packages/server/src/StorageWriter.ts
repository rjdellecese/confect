import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";
// oxlint-disable-next-line import/no-unassigned-import
import "./internal/urlCanParsePolyfill";

const make = (storageWriter: ConvexStorageWriter) => ({
  generateUploadUrl: () =>
    Effect.promise(() => storageWriter.generateUploadUrl()).pipe(
      Effect.andThen((url) =>
        pipe(
          url,
          Schema.decodeUnknownEffect(Schema.URLFromString),
          Effect.orDie,
        ),
      ),
    ),
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => new BlobNotFoundError({ id: storageId }),
    }),
});

export class StorageWriter extends Context.Service<
  StorageWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageWriter") {
  static readonly layer = (storageWriter: ConvexStorageWriter) =>
    Layer.succeed(this, make(storageWriter));
}
