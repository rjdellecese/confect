import { FunctionSpec, GroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export default GroupSpec.make("notes").addFunction(
  FunctionSpec.query({
    name: "getContent",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
