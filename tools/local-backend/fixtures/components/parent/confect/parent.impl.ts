import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { MutationRunner, QueryRunner } from "./_generated/services";
import { child } from "./child";
import parent from "./parent.spec";

const create = FunctionImpl.make(parent, "create", (args) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    return yield* runMutation(child.counter.create, args);
  }).pipe(Effect.orDie),
);
const list = FunctionImpl.make(parent, "list", (args) =>
  Effect.gen(function* () {
    const { runQuery } = yield* QueryRunner;
    return yield* runQuery(child.counter.list, args);
  }).pipe(Effect.orDie),
);
export default GroupImpl.make(parent).pipe(
  Layer.provide([create, list]),
  GroupImpl.finalize,
);
