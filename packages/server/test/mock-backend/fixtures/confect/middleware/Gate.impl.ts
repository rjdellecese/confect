import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import Gate, { GateClosed } from "./Gate.spec";

export default MiddlewareImpl.make(
  databaseSchema,
  Gate,
  (effect, { invocation: { args } }) =>
    typeof args === "object" &&
    args !== null &&
    (args as { blocked?: boolean }).blocked === true
      ? Effect.fail(GateClosed.make({ reason: "blocked by gate" }))
      : effect,
);
