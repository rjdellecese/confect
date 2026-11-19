import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { insertMarker } from "./insertMarker";
import RecordFirst from "./RecordFirst.spec";

export default MiddlewareImpl.make(RecordFirst, (effect) =>
  insertMarker("first").pipe(Effect.andThen(effect)),
);
