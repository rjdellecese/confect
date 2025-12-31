import { ConfectApiFunction, ConfectApiGroup } from "@rjdellecese/confect";
import { Schema } from "effect";

export default ConfectApiGroup.make("notes").addFunction(
  ConfectApiFunction.query({
    name: "getContent",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
