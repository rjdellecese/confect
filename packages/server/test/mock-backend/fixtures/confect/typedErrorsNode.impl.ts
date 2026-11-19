import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import typedErrorsNode from "./typedErrorsNode.spec";
import { NodeNotFound } from "./typedErrorsNode.spec";

const failingNodeAction = FunctionImpl.make(
  typedErrorsNode,
  "failingNodeAction",
  ({ id }) => Effect.fail(NodeNotFound.make({ id })),
);

export default GroupImpl.make(typedErrorsNode).pipe(
  Layer.provide(failingNodeAction),
  GroupImpl.finalize,
);
