import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import notesTable from "../_generated/tables/notes";
import { DatabaseWriter } from "../_generated/services";
import Gate from "../middleware/Gate.impl";
import RecordFirst from "../middleware/RecordFirst.impl";
import RecordFunctionLevel from "../middleware/RecordFunctionLevel.impl";
import RecordSecond from "../middleware/RecordSecond.impl";
import middlewareOrderSpec from "./middlewareOrder.spec";

const record = FunctionImpl.make(middlewareOrderSpec, "record", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(notesTable).insert({ text: "handler" });

    return null;
  }).pipe(Effect.orDie),
);

const recordPlain = FunctionImpl.make(middlewareOrderSpec, "recordPlain", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(notesTable).insert({ text: "handler" });

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(middlewareOrderSpec).pipe(
  Layer.provide(record),
  Layer.provide(recordPlain),
  Layer.provide(Gate),
  Layer.provide(RecordFirst),
  Layer.provide(RecordSecond),
  Layer.provide(RecordFunctionLevel),
  GroupImpl.finalize,
);
