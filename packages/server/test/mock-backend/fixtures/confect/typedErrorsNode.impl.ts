import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import typedErrorsNodeSpec from "./typedErrorsNode.spec";
import { NodeNotFound } from "./typedErrorsNode.spec";

const failingNodeAction = FunctionImpl.make(
  typedErrorsNodeSpec,
  "failingNodeAction",
  ({ id }) => Effect.fail(NodeNotFound.make({ id })),
);

export default GroupImpl.make(typedErrorsNodeSpec).pipe(
  Layer.provide(failingNodeAction),
  GroupImpl.finalize,
);
