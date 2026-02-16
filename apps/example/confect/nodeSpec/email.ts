import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export const email = GroupSpec.makeNode("email")
  .addFunction(
    FunctionSpec.publicNodeAction({
      name: "send",
      args: Schema.Struct({
        to: Schema.String,
        subject: Schema.String,
        body: Schema.String,
      }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicNodeAction({
      name: "getInbox",
      args: Schema.Struct({}),
      returns: Schema.Array(
        Schema.Struct({
          to: Schema.String,
          subject: Schema.String,
          body: Schema.String,
        }),
      ),
    }),
  );
