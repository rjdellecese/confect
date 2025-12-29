import { ConfectApiFunction, ConfectApiGroup } from "@rjdellecese/confect";
import { Schema } from "effect";

export const Random = ConfectApiGroup.make("random").addFunction(
  ConfectApiFunction.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  }),
);
