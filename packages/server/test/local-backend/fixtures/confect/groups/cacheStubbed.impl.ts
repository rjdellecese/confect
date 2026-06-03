/**
 * Handlers return `Math.random()` as a per-execution witness: the test
 * compares two consecutive query results to detect whether the cache evicted
 * (different values) or held (same value). `Math.random` flips
 * `observed_rng_during_execution` but that flag is not checked by
 * `MAX_CACHE_AGE` eviction, so it does not perturb the behavior under test.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import { Clock, Effect, Layer } from "effect";
import databaseSchema from "../_generated/schema";
import cacheStubbed from "./cacheStubbed.spec";

const confectNoTime = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectNoTime",
  () => Effect.sync(() => Math.random()),
);

const confectWithClock = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithClock",
  () => Clock.currentTimeMillis,
);

const confectWithRawDateNow = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithRawDateNow",
  () => Effect.sync(() => Date.now()),
);

const confectWithSpan = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithSpan",
  () =>
    Effect.sync(() => Math.random()).pipe(
      Effect.withSpan("cacheStubbed.confectWithSpan"),
    ),
);

const confectWithLog = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithLog",
  () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("cacheStubbed.confectWithLog");
      return Math.random();
    }),
);

export default GroupImpl.make(databaseSchema, cacheStubbed).pipe(
  Layer.provide(confectNoTime),
  Layer.provide(confectWithClock),
  Layer.provide(confectWithRawDateNow),
  Layer.provide(confectWithSpan),
  Layer.provide(confectWithLog),
  GroupImpl.finalize,
);
