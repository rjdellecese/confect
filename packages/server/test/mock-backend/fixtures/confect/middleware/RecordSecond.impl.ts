import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import { insertMarker } from "./insertMarker";
import RecordSecond from "./RecordSecond.spec";

export default MiddlewareImpl.make(databaseSchema, RecordSecond, (effect) =>
  insertMarker("second").pipe(Effect.andThen(effect)),
);
