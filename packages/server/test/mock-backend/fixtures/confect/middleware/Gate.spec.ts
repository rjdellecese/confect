import { MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class GateClosed extends Schema.TaggedError<GateClosed>()("GateClosed", {
  reason: Schema.String,
}) {}

/**
 * Short-circuits (without running anything downstream) when the decoded args
 * carry `blocked: true`. Attached first, so it is outermost and runs before the
 * marker middlewares.
 */
export default class Gate extends MiddlewareSpec.MiddlewareSpec<Gate>()(
  "Gate",
  {
    error: () => GateClosed,
    functionTypes: { query: false, mutation: true, action: false },
  },
) {}
