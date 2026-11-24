import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import countersTable from "./_generated/tables/counters";
import counter from "./counter.spec";

const create = FunctionImpl.make(counter, "create", ({ count }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table(countersTable).insert({ count });
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(counter, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table(countersTable)
      .index("by_creation_time")
      .collect();
  }).pipe(Effect.orDie),
);
const reject = FunctionImpl.make(counter, "reject", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const id = yield* writer
      .table(countersTable)
      .insert({ count: 999 })
      .pipe(Effect.orDie);
    return yield* Effect.fail({ _tag: "Rejected" as const, id });
  }),
);
const privateValue = FunctionImpl.make(counter, "privateValue", () =>
  Effect.succeed("private"),
);

export default GroupImpl.make(counter).pipe(
  Layer.provide([create, list, reject, privateValue]),
  GroupImpl.finalize,
);
