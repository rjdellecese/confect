import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicMutation({
    name: "seed",
    args: () => ({ caseId: Schema.String }),
    returns: () => Schema.Array(GenericId.GenericId("httpVectors")),
  }),
);
