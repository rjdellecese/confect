import { ConfectApiFunction, ConfectApiGroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export default ConfectApiGroupSpec.make("notes").addFunction(
  ConfectApiFunction.query({
    name: "getContent",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
