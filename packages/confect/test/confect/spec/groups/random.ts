import { FunctionSpec, GroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export const Random = GroupSpec.make("random").addFunction(
  FunctionSpec.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  }),
);
