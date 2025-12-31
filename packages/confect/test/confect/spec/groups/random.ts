import { ConfectApiFunction, ConfectApiGroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export const Random = ConfectApiGroupSpec.make("random").addFunction(
  ConfectApiFunction.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  }),
);
