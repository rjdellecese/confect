import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class GateClosed extends Schema.TaggedError<GateClosed>()("GateClosed", {
  reason: Schema.String,
}) {}

/**
 * Short-circuits (without running anything downstream) when the decoded args
 * carry `blocked: true`. Attached first, so it is outermost and runs before
 * the marker middlewares below.
 */
export class Gate extends MiddlewareSpec.Service<Gate>()("Gate", {
  error: () => GateClosed,
  kinds: ["mutation"],
}) {}

/** Inserts a `"first"` marker note before running the rest of the chain. */
export class RecordFirst extends MiddlewareSpec.Service<RecordFirst>()(
  "RecordFirst",
  { kinds: ["mutation"] },
) {}

/** Inserts a `"second"` marker note before running the rest of the chain. */
export class RecordSecond extends MiddlewareSpec.Service<RecordSecond>()(
  "RecordSecond",
  { kinds: ["mutation"] },
) {}

export default GroupSpec.make()
  .middleware(Gate)
  .middleware(RecordFirst)
  .middleware(RecordSecond)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "record",
      args: () => Schema.Struct({ blocked: Schema.Boolean }),
      returns: () => Schema.Null,
    }),
  );
