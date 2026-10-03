import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseWriter } from "../_generated/services";
import Gate from "../middleware/Gate.impl";
import RecordFirst from "../middleware/RecordFirst.impl";
import RecordFunctionLevel from "../middleware/RecordFunctionLevel.impl";
import RecordSecond from "../middleware/RecordSecond.impl";
import middlewareOrder from "./middlewareOrder.spec";

const record = FunctionImpl.make(
  databaseSchema,
  middlewareOrder,
  "record",
  () =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text: "handler" });

      return null;
    }).pipe(Effect.orDie),
);

const recordPlain = FunctionImpl.make(
  databaseSchema,
  middlewareOrder,
  "recordPlain",
  () =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text: "handler" });

      return null;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, middlewareOrder).pipe(
  Layer.provide(record),
  Layer.provide(recordPlain),
  Layer.provide(Gate),
  Layer.provide(RecordFirst),
  Layer.provide(RecordSecond),
  Layer.provide(RecordFunctionLevel),
  GroupImpl.finalize,
);
