import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import schema from "../_generated/schema";
import { MutationRunner, QueryRunner } from "../_generated/services";
import { first, second, left, right } from "../componentBindings";
import spec from "./components.spec";

const exercise = FunctionImpl.make(schema, spec, "exercise", ({ run }) =>
  Effect.gen(function* () {
    const runMutation = yield* MutationRunner;
    const runQuery = yield* QueryRunner;
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
      first: (yield* runQuery(first.counter.list, { run })).map(
        (doc) => doc.count,
      ),
      second: (yield* runQuery(second.counter.list, { run })).map(
        (doc) => doc.count,
      ),
      left: (yield* runQuery(left.parent.list, { run })).map(
        (doc) => doc.count,
      ),
      right: (yield* runQuery(right.parent.list, { run })).map(
        (doc) => doc.count,
      ),
      rejectedId,
    };
  }).pipe(Effect.orDie),
);
const schedule = FunctionImpl.make(schema, spec, "schedule", ({ run }) =>
  Effect.gen(function* () {
    const runMutation = yield* MutationRunner;
    return yield* runMutation(first.counter.schedule, { run, count: 17 });
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(schema, spec, "list", (args) =>
  Effect.gen(function* () {
    const runQuery = yield* QueryRunner;
    return {
      first: (yield* runQuery(first.counter.list, args)).map(
        (doc) => doc.count,
      ),
      second: (yield* runQuery(second.counter.list, args)).map(
        (doc) => doc.count,
      ),
    };
  }).pipe(Effect.orDie),
);
const uploadUrl = FunctionImpl.make(schema, spec, "uploadUrl", () =>
  Effect.gen(function* () {
    const runMutation = yield* MutationRunner;
    return yield* runMutation(first.counter.uploadUrl, {});
  }).pipe(Effect.orDie),
);
const storageUrl = FunctionImpl.make(schema, spec, "storageUrl", (args) =>
  Effect.gen(function* () {
    const runQuery = yield* QueryRunner;
    return yield* runQuery(first.counter.storageUrl, args);
  }).pipe(Effect.orDie),
);
const hasAuth = FunctionImpl.make(schema, spec, "hasAuth", () =>
  Effect.gen(function* () {
    const runQuery = yield* QueryRunner;
    return yield* runQuery(first.counter.hasAuth, {});
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(schema, spec).pipe(
  Layer.provide([exercise, schedule, list, uploadUrl, storageUrl, hasAuth]),
  GroupImpl.finalize,
);
