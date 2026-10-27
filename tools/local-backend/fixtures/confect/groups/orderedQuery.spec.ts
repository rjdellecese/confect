import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "seed",
      args: () => ({ caseId: Schema.String, count: Schema.Finite }),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "first",
      args: () => ({ caseId: Schema.String }),
      returns: () => Schema.NullOr(Schema.Finite),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "take",
      args: () => ({ caseId: Schema.String, n: Schema.Finite }),
      returns: () => Schema.Array(Schema.Finite),
    }),
  );
