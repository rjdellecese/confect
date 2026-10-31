import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import schema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import counter from "./counter.spec";

const create = FunctionImpl.make(schema, counter, "create", ({ count }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("counters").insert({ count });
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(schema, counter, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("counters").index("by_creation_time").collect();
  }).pipe(Effect.orDie),
);
const reject = FunctionImpl.make(schema, counter, "reject", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const id = yield* writer
      .table("counters")
      .insert({ count: 999 })
      .pipe(Effect.orDie);
    return yield* Effect.fail({ _tag: "Rejected" as const, id });
  }),
);
const privateValue = FunctionImpl.make(schema, counter, "privateValue", () =>
  Effect.succeed("private"),
);

export default GroupImpl.make(schema, counter).pipe(
  Layer.provide([create, list, reject, privateValue]),
  GroupImpl.finalize,
);
