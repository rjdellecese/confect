import { ConfectApiFunctionSpec, ConfectApiGroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";

export default ConfectApiGroupSpec.make("notes").addFunction(
  ConfectApiFunctionSpec.query({
    name: "getContent",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
