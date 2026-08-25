import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectNoTime",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithClock",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithRawDateNow",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithSpan",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithLog",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  );
