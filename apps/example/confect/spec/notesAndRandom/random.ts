import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export const random = GroupSpec.make("random").addFunction(
  FunctionSpec.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  }),
);
