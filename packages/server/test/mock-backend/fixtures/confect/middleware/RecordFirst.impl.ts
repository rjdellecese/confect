import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import { insertMarker } from "./insertMarker";
import RecordFirst from "./RecordFirst.spec";

export default MiddlewareImpl.make(databaseSchema, RecordFirst, (effect) =>
  insertMarker("first").pipe(Effect.andThen(effect)),
);
