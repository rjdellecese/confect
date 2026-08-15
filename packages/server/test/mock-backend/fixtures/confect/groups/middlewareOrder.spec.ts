import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class GateClosed extends Schema.TaggedError<GateClosed>()("GateClosed", {
  reason: Schema.String,
}) {}

export class FunctionGateClosed extends Schema.TaggedError<FunctionGateClosed>()(
  "FunctionGateClosed",
  {},
) {}

/**
 * Short-circuits (without running anything downstream) when the decoded args
 * carry `blocked: true`. Attached first, so it is outermost and runs before
 * the marker middlewares below.
 */
export class Gate extends MiddlewareSpec.Service<Gate>()("Gate", {
  error: () => GateClosed,
  functionTypes: ["mutation"],
}) {}

/** Inserts a `"first"` marker note before running the rest of the chain. */
export class RecordFirst extends MiddlewareSpec.Service<RecordFirst>()(
  "RecordFirst",
  { functionTypes: ["mutation"] },
) {}

/** Inserts a `"second"` marker note before running the rest of the chain. */
export class RecordSecond extends MiddlewareSpec.Service<RecordSecond>()(
  "RecordSecond",
  { functionTypes: ["mutation"] },
) {}

/**
 * Function-level middleware on `record` only: runs inside the group-attached
 * chain, inserts a `"function"` marker, and short-circuits with
 * `FunctionGateClosed` when the decoded args carry `blockedAtFunction: true`.
 */
export class RecordFunctionLevel extends MiddlewareSpec.Service<RecordFunctionLevel>()(
  "RecordFunctionLevel",
  {
    error: () => FunctionGateClosed,
    functionTypes: ["mutation"],
  },
) {}

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
