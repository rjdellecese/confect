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
    getUrl: reader.getUrl,
    generateUploadUrl: Effect.flatMap(
      StorageWriter,
      (writer) => writer.generateUploadUrl,
    ),
    delete: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageWriter, (writer) => writer.delete(storageId)),
    get: (storageId: GenericId<"_storage">) =>
      Effect.flatMap(StorageActionWriter, (writer) => writer.get(storageId)),
    store: (blob: Blob, options?: { sha256?: string }) =>
      Effect.flatMap(StorageActionWriter, (writer) =>
        writer.store(blob, options),
      ),
  };
});

export class Storage extends Context.Service<
  Storage,
  Effect.Success<typeof make>
>()("@confect/server/Storage") {}

export const layer = (storageReader: ConvexStorageReader) =>
  Layer.effect(Storage, make).pipe(
    Layer.provideMerge(StorageReader.layer(storageReader)),
  );
