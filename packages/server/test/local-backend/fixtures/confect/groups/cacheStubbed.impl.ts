/**
 * Handlers return `Random.next` as a per-execution witness: the test
 * compares two consecutive query results to detect whether the cache evicted
 * (different values) or held (same value). The live Random service delegates
 * to `Math.random`, which flips
 * `observed_rng_during_execution` but that flag is not checked by
 * `MAX_CACHE_AGE` eviction, so it does not perturb the behavior under test.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import databaseSchema from "../_generated/schema";
import cacheStubbed from "./cacheStubbed.spec";

const confectNoTime = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectNoTime",
  () => Random.next,
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
  () =>
    // oxlint-disable-next-line effecttsgo/global-date-in-effect -- This fixture verifies that raw time access evicts Convex's query cache.
    Effect.sync(() => Date.now()),
);

const confectWithSpan = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithSpan",
  () => Random.next.pipe(Effect.withSpan("cacheStubbed.confectWithSpan")),
);

const confectWithLog = FunctionImpl.make(
  databaseSchema,
  cacheStubbed,
  "confectWithLog",
  () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("cacheStubbed.confectWithLog");
      return yield* Random.next;
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
