import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
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
