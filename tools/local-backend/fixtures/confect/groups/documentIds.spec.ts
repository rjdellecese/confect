import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

const inspection = {
  args: () => ({
    table: Schema.Literals([
      "transactionNotes",
      "_storage",
      "_scheduled_functions",
    ]),
    input: Schema.String,
  }),
  returns: () =>
    Schema.Struct({
      parsed: Schema.NullOr(Schema.String),
      normalized: Schema.NullOr(Schema.String),
      identified: Schema.NullOr(
        Schema.Struct({ table: Schema.String, id: Schema.String }),
      ),
    }),
};

export default GroupSpec.make()
  .addFunction(FunctionSpec.publicQuery({ name: "inspect", ...inspection }))
  .addFunction(
    FunctionSpec.publicMutation({ name: "inspectFromMutation", ...inspection }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createAndDelete",
      returns: () => GenericId.GenericId("transactionNotes"),
    }),
  );
