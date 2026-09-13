import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import databaseSchema from "../_generated/schema";
import { insertMarker } from "./insertMarker";
import RecordFunctionLevel, {
  FunctionGateClosed,
} from "./RecordFunctionLevel.spec";

export default MiddlewareImpl.make(
  databaseSchema,
  RecordFunctionLevel,
  (effect, { invocation: { args } }) =>
    Predicate.isObjectOrArray(args) &&
    Predicate.hasProperty(args, "blockedAtFunction") &&
    args.blockedAtFunction === true
      ? Effect.fail(new FunctionGateClosed())
      : insertMarker("function").pipe(Effect.andThen(effect)),
);
