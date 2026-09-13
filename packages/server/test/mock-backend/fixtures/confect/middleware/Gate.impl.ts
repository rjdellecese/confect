import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import databaseSchema from "../_generated/schema";
import Gate, { GateClosed } from "./Gate.spec";

export default MiddlewareImpl.make(
  databaseSchema,
  Gate,
  (effect, { invocation: { args } }) =>
    Predicate.isObjectOrArray(args) &&
    Predicate.hasProperty(args, "blocked") &&
    args.blocked === true
      ? Effect.fail(new GateClosed({ reason: "blocked by gate" }))
      : effect,
);
