import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class ObserveExecution extends MiddlewareSpec.MiddlewareSpec<ObserveExecution>()(
  "ObserveExecution",
  {
    functionTypes: { query: true, mutation: true, action: true },
  },
) {}

export const executionFields = () => ({
  functionName: Schema.String,
  functionType: Schema.String,
  deploymentName: Schema.String,
});

export const requestFields = () => ({
  requestId: Schema.String,
  ip: Schema.NullOr(Schema.String),
  scheduledFunctionId: Schema.NullOr(Schema.String),
});

export default GroupSpec.make()
  .middleware(ObserveExecution)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "queryMetadata",
      returns: () =>
        Schema.Struct({
          ...executionFields(),
          remainingReads: Schema.Finite,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "mutationMetadata",
      returns: () =>
        Schema.Struct({
          ...executionFields(),
          ...requestFields(),
          remainingWrites: Schema.Finite,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "actionMetadata",
      returns: () =>
        Schema.Struct({ ...executionFields(), ...requestFields() }),
    }),
  );
