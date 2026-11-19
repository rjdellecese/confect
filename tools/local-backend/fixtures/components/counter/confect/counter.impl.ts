import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import refs from "./_generated/refs";
import counters from "./_generated/tables/counters";
import {
  DatabaseReader,
  DatabaseWriter,
  QueryCtx,
  Scheduler,
  StorageReader,
  StorageWriter,
} from "./_generated/services";
import counter, { Rejected } from "./counter.spec";

const create = FunctionImpl.make(counter, "create", (args) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table(counters).insert(args);
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(counter, "list", ({ run }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table(counters)
      .index("by_run", (range) => range.eq("run", run))
      .collect();
  }).pipe(Effect.orDie),
);
const paginate = FunctionImpl.make(
  counter,
  "paginate",
  ({ run, paginationOpts }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      return yield* reader
        .table(counters)
        .index("by_run", (range) => range.eq("run", run))
        .paginate(paginationOpts);
    }).pipe(Effect.orDie),
);
const reject = FunctionImpl.make(counter, "reject", ({ run }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const id = yield* writer
      .table(counters)
      .insert({ run, count: 999 })
      .pipe(Effect.orDie);
    return yield* Rejected.make({ id });
  }),
);
const schedule = FunctionImpl.make(counter, "schedule", (args) =>
  Effect.gen(function* () {
    const scheduler = yield* Scheduler;
    return yield* scheduler.runAfter(
      Duration.zero,
      refs.public.counter.create,
      args,
    );
  }),
);
const uploadUrl = FunctionImpl.make(counter, "uploadUrl", () =>
  Effect.gen(function* () {
    const storage = yield* StorageWriter;
    return (yield* storage.generateUploadUrl).toString();
  }),
);
const storageUrl = FunctionImpl.make(counter, "storageUrl", ({ id }) =>
  Effect.gen(function* () {
    const storage = yield* StorageReader;
    return (yield* storage.getUrl(id)).toString();
  }).pipe(Effect.orDie),
);
const hasAuth = FunctionImpl.make(counter, "hasAuth", () =>
  Effect.map(QueryCtx, (ctx) => Predicate.hasProperty(ctx, "auth")),
);

export default GroupImpl.make(counter).pipe(
  Layer.provide([
    create,
    list,
    paginate,
    reject,
    schedule,
    uploadUrl,
    storageUrl,
    hasAuth,
  ]),
  GroupImpl.finalize,
);
