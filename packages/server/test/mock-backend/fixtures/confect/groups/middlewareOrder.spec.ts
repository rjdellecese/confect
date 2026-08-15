import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import Gate from "../middleware/Gate.spec";
import RecordFirst from "../middleware/RecordFirst.spec";
import RecordFunctionLevel from "../middleware/RecordFunctionLevel.spec";
import RecordSecond from "../middleware/RecordSecond.spec";

export default GroupSpec.make()
  .middleware(Gate)
  .middleware(RecordFirst)
  .middleware(RecordSecond)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "record",
      args: () =>
        Schema.Struct({
          blocked: Schema.Boolean,
          blockedAtFunction: Schema.Boolean,
        }),
      returns: () => Schema.Null,
    }).middleware(RecordFunctionLevel),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "recordPlain",
      args: () => Schema.Struct({}),
      returns: () => Schema.Null,
    }),
  );
