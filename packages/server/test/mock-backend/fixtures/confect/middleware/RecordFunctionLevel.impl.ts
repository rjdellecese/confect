import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import { insertMarker } from "./insertMarker";
import RecordFunctionLevel, {
  FunctionGateClosed,
} from "./RecordFunctionLevel.spec";

export default MiddlewareImpl.make(
  databaseSchema,
  RecordFunctionLevel,
  (effect, { args }) =>
    typeof args === "object" &&
    args !== null &&
    (args as { blockedAtFunction?: boolean }).blockedAtFunction === true
      ? Effect.fail(new FunctionGateClosed())
      : insertMarker("function").pipe(Effect.andThen(effect)),
);
