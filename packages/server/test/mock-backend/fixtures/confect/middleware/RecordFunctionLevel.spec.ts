import { MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class FunctionGateClosed extends Schema.TaggedError<FunctionGateClosed>()(
  "FunctionGateClosed",
  {},
) {}

/**
 * Attached to a single function rather than a group: runs inside the
 * group-attached chain, inserts a `"function"` marker, and short-circuits with
 * `FunctionGateClosed` when the decoded args carry `blockedAtFunction: true`.
 */
export default class RecordFunctionLevel extends MiddlewareSpec.Service<RecordFunctionLevel>()(
  "RecordFunctionLevel",
  {
    error: () => FunctionGateClosed,
    functionTypes: { query: false, action: false },
  },
) {}
