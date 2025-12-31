import { ConfectApiFunctionSpec, ConfectApiGroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export const Random = ConfectApiGroupSpec.make("random").addFunction(
  ConfectApiFunctionSpec.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  }),
);
