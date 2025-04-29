import type { StorageReader, StorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import { Effect } from "effect";

export class ConvexStorageReader extends Effect.Tag(
  "@rjdellecese/confect/ConvexStorageReader",
)<ConvexStorageReader, StorageReader>() {}

export class ConfectStorageReader extends Effect.Service<ConfectStorageReader>()(
  "@rjdellecese/confect/ConfectStorageReader",
  {
    succeed: {
      getUrl: (storageId: GenericId<"_storage">) =>
        // TODO: Which errors might occur?
        ConvexStorageReader.use(({ getUrl }) => getUrl(storageId)),
    },
  },
) {}

export class ConvexStorageWriter extends Effect.Tag(
  "@rjdellecese/confect/ConvexStorageWriter",
)<ConvexStorageWriter, StorageWriter>() {}

export class ConfectStorageWriter extends Effect.Service<ConfectStorageWriter>()(
  "@rjdellecese/confect/ConfectStorageWriter",
  {
    succeed: {
      generateUploadUrl: () =>
        // TODO: Which errors might occur?
        ConvexStorageWriter.use(({ generateUploadUrl }) => generateUploadUrl()),
      delete: (storageId: GenericId<"_storage">) =>
        // TODO: Can this throw?
        ConvexStorageWriter.use(({ delete: storageDelete }) =>
          storageDelete(storageId),
        ),
    },
  },
) {}
