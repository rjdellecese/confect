import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import Gate, { GateClosed } from "./Gate.spec";

export default MiddlewareImpl.make(Gate, (effect, { invocation: { args } }) =>
  typeof args === "object" &&
  args !== null &&
  (args as { blocked?: boolean }).blocked === true
    ? Effect.fail(GateClosed.make({ reason: "blocked by gate" }))
    : effect,
);
