import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseWriter } from "../_generated/services";
import middlewareOrder, {
  Gate,
  GateClosed,
  RecordFirst,
  RecordSecond,
} from "./middlewareOrder.spec";

const insertMarker = (text: string) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie);

const GateLive = MiddlewareImpl.make(
  databaseSchema,
  Gate,
  (effect, { args }) =>
    typeof args === "object" &&
    args !== null &&
    (args as { blocked?: boolean }).blocked === true
      ? Effect.fail(new GateClosed({ reason: "blocked by gate" }))
      : effect,
);

const RecordFirstLive = MiddlewareImpl.make(
  databaseSchema,
  RecordFirst,
  (effect) => insertMarker("first").pipe(Effect.andThen(effect)),
);

const RecordSecondLive = MiddlewareImpl.make(
  databaseSchema,
  RecordSecond,
  (effect) => insertMarker("second").pipe(Effect.andThen(effect)),
);

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

export default GroupImpl.make(databaseSchema, middlewareOrder).pipe(
  Layer.provide(record),
  Layer.provide(GateLive),
  Layer.provide(RecordFirstLive),
  Layer.provide(RecordSecondLive),
  GroupImpl.finalize,
);
