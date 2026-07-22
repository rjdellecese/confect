/**
 * Handlers run one effect per element so the fiber burns several multiples
 * of `MaxOpsBeforeYield` (2048) and is forced through cooperative scheduler
 * yields mid-handler. Convex bans `setTimeout` in queries and mutations, so
 * these functions only succeed if the scheduler never dispatches through
 * timer APIs.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import scheduling from "./scheduling.spec";

const sumToN = (n: number) =>
  Effect.gen(function* () {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      // `Effect.sync` (unlike `Effect.succeed`, which the generator runtime
      // unwraps without touching the op counter) charges the fiber's op
      // budget on every iteration.
      sum += yield* Effect.sync(() => i);
    }
    return sum;
  });

const manyOpsQuery = FunctionImpl.make(
  databaseSchema,
  scheduling,
  "manyOpsQuery",
  () => sumToN(5000),
);

const manyOpsMutation = FunctionImpl.make(
  databaseSchema,
  scheduling,
  "manyOpsMutation",
  () => sumToN(5000),
);

export default GroupImpl.make(databaseSchema, scheduling).pipe(
  Layer.provide(manyOpsQuery),
  Layer.provide(manyOpsMutation),
  GroupImpl.finalize,
);
