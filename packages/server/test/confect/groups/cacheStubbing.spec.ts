import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export const cacheStubbing = GroupSpec.make("cacheStubbing")
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectNoTime",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithClock",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithRawDateNow",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  );
