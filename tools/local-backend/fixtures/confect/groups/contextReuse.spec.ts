import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

const observationFields = () => ({
  subject: Schema.NullOr(Schema.String),
  previousInvocation: Schema.NullOr(
    Schema.Struct({ subject: Schema.NullOr(Schema.String), nonce: Schema.Int }),
  ),
  functionType: Schema.String,
  values: Schema.Array(Schema.String),
});

export default GroupSpec.make({ experimental_reuseContext: true })
  .addFunction(
    FunctionSpec.publicQuery({
      name: "read",
      args: () => ({ caseId: Schema.String, nonce: Schema.Int }),
      returns: () => Schema.Struct(observationFields()),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "write",
      args: () => ({
        caseId: Schema.String,
        nonce: Schema.Int,
        value: Schema.String,
      }),
      returns: () =>
        Schema.Struct({
          ...observationFields(),
          previousValues: Schema.Array(Schema.String),
        }),
    }),
  );
