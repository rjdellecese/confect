import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import databaseSchema from "../_generated/schema";
import typedErrorsNode from "./typedErrorsNode.spec";
import { NodeNotFound } from "./typedErrorsNode.spec";

const failingNodeAction = FunctionImpl.make(
  databaseSchema,
  typedErrorsNode,
  "failingNodeAction",
  ({ id }) => Effect.fail(new NodeNotFound({ id })),
);

export default GroupImpl.make(databaseSchema, typedErrorsNode).pipe(
  Layer.provide(failingNodeAction),
  GroupImpl.finalize,
);
