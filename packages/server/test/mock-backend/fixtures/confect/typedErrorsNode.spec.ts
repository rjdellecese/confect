import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class NodeNotFound extends Schema.TaggedError<NodeNotFound>()(
  "NodeNotFound",
  { id: Schema.String },
) {}

export default GroupSpec.makeNode().addFunction(
  FunctionSpec.publicNodeAction({
    name: "failingNodeAction",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NodeNotFound,
  }),
);
