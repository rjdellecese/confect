import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export default GroupSpec.make()
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
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithSpan",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithLog",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  );
