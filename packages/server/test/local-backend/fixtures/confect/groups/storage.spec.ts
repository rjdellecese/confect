import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "generateUploadUrl",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getUrl",
      args: () => Schema.Struct({ storageId: GenericId.GenericId("_storage") }),
      returns: () => Schema.String,
    }),
  );
