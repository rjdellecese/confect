import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class StorageRollback extends Schema.TaggedError<StorageRollback, {}>()(
  "StorageRollback",
  { storageId: GenericId.GenericId("_storage") },
) {}

const blobResult = () =>
  Schema.Struct({
    storageId: GenericId.GenericId("_storage"),
    text: Schema.String,
    type: Schema.String,
    size: Schema.Finite,
  });

const fileMetrics = () =>
  Schema.Struct({
    filesRead: Schema.Finite,
    fileReadBytes: Schema.Finite,
    filesWritten: Schema.Finite,
    fileWriteBytes: Schema.Finite,
  });

const fileOperations = () => ({
  sizes: Schema.Array(Schema.Finite),
  storageIds: Schema.Array(GenericId.GenericId("_storage")),
});

const fileResult = () =>
  Schema.Struct({
    storageIds: Schema.Array(GenericId.GenericId("_storage")),
    failures: Schema.Array(Schema.String),
    metrics: fileMetrics(),
  });

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "storeMutation",
      args: () => ({
        text: Schema.String,
        type: Schema.String,
        sha256: Schema.optionalKey(Schema.String),
      }),
      returns: blobResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "getMutation",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: blobResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "deleteAndGet",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: () =>
        Schema.Struct({
          id: Schema.String,
          tag: Schema.Literal("BlobNotFoundError"),
        }),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "replaceThenFail",
      args: () => ({
        parentId: GenericId.GenericId("_storage"),
        readId: GenericId.GenericId("_storage"),
      }),
      returns: () => GenericId.GenericId("_storage"),
      error: () => StorageRollback,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "rollback",
      args: () => ({ readId: GenericId.GenericId("_storage") }),
      returns: () =>
        Schema.Struct({
          parentId: GenericId.GenericId("_storage"),
          rolledBackId: GenericId.GenericId("_storage"),
          metrics: fileMetrics(),
        }),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "pendingUrl",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: () => Schema.NullOr(Schema.String),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "staleRead",
      args: () => ({ stale: Schema.Boolean }),
      returns: () =>
        Schema.Struct({
          storageId: GenericId.GenericId("_storage"),
          url: Schema.NullOr(Schema.String),
          text: Schema.String,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "exerciseFiles",
      args: fileOperations,
      returns: fileResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "limitedFiles",
      args: () => ({ ...fileOperations(), limits: fileMetrics() }),
      returns: fileResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "generateUploadUrl",
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getUrl",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "store",
      args: () => ({ text: Schema.String }),
      returns: () => GenericId.GenericId("_storage"),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "get",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "deleteBlob",
      args: () => ({ storageId: GenericId.GenericId("_storage") }),
      returns: () => Schema.Null,
    }),
  );
