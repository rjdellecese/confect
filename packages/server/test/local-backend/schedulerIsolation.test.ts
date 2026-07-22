/**
 * End-to-end test of Effect's cooperative fiber yielding inside Convex's real
 * query/mutation isolate, which bans `setTimeout` and has no `setImmediate`.
 * The fixture handlers run well past `MaxOpsBeforeYield` (2048) fiber
 * operations, forcing scheduler yields mid-handler; without the microtask
 * scheduler that `RegisteredConvexFunction` installs, the backend rejects
 * with "Can't use setTimeout in queries and mutations."
 */

import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

// The fixtures sum 1..5000.
const expectedSum = (5000 * 5001) / 2;

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "Effect scheduler inside the Convex isolate",
  (it) => {
    it.effect("a query exceeding the fiber op budget succeeds", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const result = yield* Effect.promise(() =>
          client.query(
            Ref.getFunctionReference(
              refs.public.groups.scheduling.manyOpsQuery,
            ),
            {},
          ),
        );
        expect(result).toBe(expectedSum);
      }),
    );

    it.effect("a mutation exceeding the fiber op budget succeeds", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const result = yield* Effect.promise(() =>
          client.mutation(
            Ref.getFunctionReference(
              refs.public.groups.scheduling.manyOpsMutation,
            ),
            {},
          ),
        );
        expect(result).toBe(expectedSum);
      }),
    );
  },
);
