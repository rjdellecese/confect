import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { insertMarker } from "./insertMarker";
import RecordFunctionLevel, {
  FunctionGateClosed,
} from "./RecordFunctionLevel.spec";

export default MiddlewareImpl.make(
  RecordFunctionLevel,
  (effect, { invocation: { args } }) =>
    typeof args === "object" &&
    args !== null &&
    (args as { blockedAtFunction?: boolean }).blockedAtFunction === true
      ? Effect.fail(FunctionGateClosed.make())
      : insertMarker("function").pipe(Effect.andThen(effect)),
);
