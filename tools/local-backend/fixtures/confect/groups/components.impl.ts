import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { MutationRunner, QueryRunner } from "../_generated/services";
import { first, second, left, right } from "../componentBindings";
import spec from "./components.spec";

const seedPagination = FunctionImpl.make(spec, "seedPagination", ({ run }) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    const ids = yield* Effect.forEach(
      [2, 3, 5],
      (count) => runMutation(first.counter.create, { run, count }),
      { concurrency: 1 },
    );
    yield* runMutation(second.counter.create, { run, count: 99 });
    return { first: ids };
  }).pipe(Effect.orDie),
);
const paginate = FunctionImpl.make(spec, "paginate", (args) =>
  Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    const result = yield* runQuery(first.counter.paginate, args);
    return {
      ...result,
      page: Array.map(result.page, (doc) => ({
        id: doc._id,
        count: doc.count,
      })),
    };
  }).pipe(Effect.orDie),
);

const exercise = FunctionImpl.make(spec, "exercise", ({ run }) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    const { runQuery } = yield* QueryRunner;
    yield* runMutation(second.counter.create, { run, count: 7 });
    yield* runMutation(left.parent.create, { run, count: 11 });
    yield* runMutation(right.parent.create, { run, count: 13 });
    const rejectedId = yield* runMutation(first.counter.reject, { run }).pipe(
      Effect.andThen(() =>
        Effect.die("Expected the component mutation to fail"),
      ),
      Effect.catchTag("Rejected", (error) => Effect.succeed(error.id)),
    );
    return {
      first: yield* runQuery(first.counter.list, { run }).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
      second: yield* runQuery(second.counter.list, { run }).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
      left: yield* runQuery(left.parent.list, { run }).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
      right: yield* runQuery(right.parent.list, { run }).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
      rejectedId,
    };
  }).pipe(Effect.orDie),
);
const schedule = FunctionImpl.make(spec, "schedule", ({ run }) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    return yield* runMutation(first.counter.schedule, { run, count: 17 });
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(spec, "list", (args) =>
  Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    return {
      first: yield* runQuery(first.counter.list, args).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
      second: yield* runQuery(second.counter.list, args).pipe(
        Effect.map(Array.map((doc) => doc.count)),
      ),
    };
  }).pipe(Effect.orDie),
);
const uploadUrl = FunctionImpl.make(spec, "uploadUrl", () =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    return yield* runMutation(first.counter.uploadUrl, {});
  }).pipe(Effect.orDie),
);
const storageUrl = FunctionImpl.make(spec, "storageUrl", (args) =>
  Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    return yield* runQuery(first.counter.storageUrl, args);
  }).pipe(Effect.orDie),
);
const hasAuth = FunctionImpl.make(spec, "hasAuth", () =>
  Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    return yield* runQuery(first.counter.hasAuth, {});
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(spec).pipe(
  Layer.provide([
    seedPagination,
    paginate,
    exercise,
    schedule,
    list,
    uploadUrl,
    storageUrl,
    hasAuth,
  ]),
  GroupImpl.finalize,
);
