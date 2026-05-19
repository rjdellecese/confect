import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export class NodeNotFound extends Schema.TaggedError<NodeNotFound>()(
  "NodeNotFound",
  { id: Schema.String },
) {}

export const typedErrorsNode = GroupSpec.makeNode(
  "typedErrorsNode",
).addFunction(
  FunctionSpec.publicNodeAction({
    name: "failingNodeAction",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NodeNotFound,
  }),
);
