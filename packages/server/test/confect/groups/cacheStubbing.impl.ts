import { FunctionImpl, GroupImpl } from "@confect/server";
import { Clock, Effect, Layer } from "effect";
import api from "../_generated/api";

const confectNoTime = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectNoTime",
  () => Effect.sync(() => Math.random()),
);

const confectWithClock = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectWithClock",
  () =>
    Effect.gen(function* () {
      yield* Clock.currentTimeMillis;
      return Math.random();
    }),
);

const confectWithRawDateNow = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectWithRawDateNow",
  () =>
    Effect.sync(() => {
      Date.now();
      return Math.random();
    }),
);

export const cacheStubbing = GroupImpl.make(api, "groups.cacheStubbing").pipe(
  Layer.provide(confectNoTime),
  Layer.provide(confectWithClock),
  Layer.provide(confectWithRawDateNow),
);
