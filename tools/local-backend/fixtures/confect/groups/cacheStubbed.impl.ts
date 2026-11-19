/**
 * Handlers return `Random.next` as a per-execution witness: the test compares
 * two consecutive query results to detect whether the cache evicted (different
 * values) or held (same value). The live Random service delegates to
 * `Math.random`, which flips `observed_rng_during_execution` but that flag is
 * not checked by `MAX_CACHE_AGE` eviction, so it does not perturb the behavior
 * under test.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { TransactionMetadata } from "../_generated/services";
import cacheStubbedSpec from "./cacheStubbed.spec";

const confectNoTime = FunctionImpl.make(
  cacheStubbedSpec,
  "confectNoTime",
  () => Random.next,
);

const confectWithSnapshot = FunctionImpl.make(
  cacheStubbedSpec,
  "confectWithSnapshot",
  () =>
    Effect.flatMap(TransactionMetadata, (transaction) =>
      transaction.getSnapshotTs(),
    ),
);

const confectWithClock = FunctionImpl.make(
  cacheStubbedSpec,
  "confectWithClock",
  () => Clock.currentTimeMillis,
);

const confectWithRawDateNow = FunctionImpl.make(
  cacheStubbedSpec,
  "confectWithRawDateNow",
  () =>
    // oxlint-disable-next-line effecttsgo/global-date-in-effect -- This fixture verifies that raw time access evicts Convex's query cache.
    Effect.sync(() => Date.now()),
);

const confectWithSpan = FunctionImpl.make(
  cacheStubbedSpec,
  "confectWithSpan",
  () => Random.next.pipe(Effect.withSpan("cacheStubbed.confectWithSpan")),
);

const confectWithLog = FunctionImpl.make(
  cacheStubbedSpec,
  "confectWithLog",
  () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("cacheStubbed.confectWithLog");
      return yield* Random.next;
    }),
);

export default GroupImpl.make(cacheStubbedSpec).pipe(
  Layer.provide(confectWithSnapshot),
  Layer.provide(confectNoTime),
  Layer.provide(confectWithClock),
  Layer.provide(confectWithRawDateNow),
  Layer.provide(confectWithSpan),
  Layer.provide(confectWithLog),
  GroupImpl.finalize,
);
