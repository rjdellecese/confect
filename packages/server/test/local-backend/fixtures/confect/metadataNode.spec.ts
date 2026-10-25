import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { executionFields, requestFields } from "./groups/metadata.spec";

export default GroupSpec.makeNode().addFunction(
  FunctionSpec.publicNodeAction({
    name: "metadata",
    returns: () => Schema.Struct({ ...executionFields(), ...requestFields() }),
  }),
);
