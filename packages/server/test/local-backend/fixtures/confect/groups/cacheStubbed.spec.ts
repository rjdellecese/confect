import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectNoTime",
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithClock",
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithRawDateNow",
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithSpan",
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "confectWithLog",
      returns: () => Schema.Finite,
    }),
  );
