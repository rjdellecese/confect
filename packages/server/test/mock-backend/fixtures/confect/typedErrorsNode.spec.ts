import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class NodeNotFound extends Schema.TaggedErrorClass<NodeNotFound>()(
  "NodeNotFound",
  { id: Schema.String },
) {}

export default GroupSpec.makeNode().addFunction(
  FunctionSpec.publicNodeAction({
    name: "failingNodeAction",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NodeNotFound,
  }),
);
