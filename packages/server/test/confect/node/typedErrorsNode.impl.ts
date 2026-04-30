import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import nodeApi from "../_generated/nodeApi";
import { NodeNotFound } from "./typedErrorsNode.spec";

const failingNodeAction = FunctionImpl.make(
  nodeApi,
  "typedErrorsNode",
  "failingNodeAction",
  ({ id }) => Effect.fail(new NodeNotFound({ id })),
);

export const typedErrorsNode = GroupImpl.make(nodeApi, "typedErrorsNode").pipe(
  Layer.provide(failingNodeAction),
);
