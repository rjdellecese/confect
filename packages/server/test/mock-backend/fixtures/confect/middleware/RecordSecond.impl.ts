import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { insertMarker } from "./insertMarker";
import RecordSecond from "./RecordSecond.spec";

export default MiddlewareImpl.make(RecordSecond, (effect) =>
  insertMarker("second").pipe(Effect.andThen(effect)),
);
