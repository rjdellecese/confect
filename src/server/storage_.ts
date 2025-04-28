import type { StorageReader, StorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { Effect } from "effect";

export class ConvexStorageReader extends Effect.Tag(
  "@rjdellecese/confect/ConvexStorageReader",
)<ConvexStorageReader, StorageReader>() {}

export class ConfectStorageReader extends Effect.Service<ConfectStorageReader>()(
  "@rjdellecese/confect/ConfectStorageReader",
  {
    effect: Effect.gen(function* () {
      const storage = yield* ConvexStorageReader;

      return {
        getUrl: (storageId: GenericId<"_storage">) =>
          Effect.promise(() => storage.getUrl(storageId)),
      };
    }),
  },
) {}

export class ConvexStorageWriter extends Effect.Tag(
  "@rjdellecese/confect/ConvexStorageWriter",
)<ConvexStorageWriter, StorageWriter>() {}

export class ConfectStorageWriter extends Effect.Service<ConfectStorageWriter>()(
  "@rjdellecese/confect/ConfectStorageWriter",
  {
    effect: Effect.gen(function* () {
      const storage = yield* ConvexStorageWriter;

      return {
        generateUploadUrl: Effect.promise(() => storage.generateUploadUrl()),
        delete: (storageId: GenericId<"_storage">) =>
          // TODO: Can this throw?
          Effect.promise(() => storage.delete(storageId)),
      };
    }),
  },
) {}
