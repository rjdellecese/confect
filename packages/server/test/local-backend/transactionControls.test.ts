import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import refs from "confect-local-backend/refs";
import * as LocalBackend from "confect-local-backend/LocalBackend";

const functions = refs.public.groups.transactions;

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "transaction controls",
  (it) => {
    it.effect("enforces nested query limits in queries and mutations", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const caseId = "read-limits";
        yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(functions.seed), {
            caseId,
            count: 2,
          }),
        );
        const promiseResult = yield* Effect.promise(() =>
          client.query(Ref.getFunctionReference(functions.limitedRead), {
            caseId,
            limit: 10,
          }),
        );
        expect(promiseResult).toEqual(["seed-0", "seed-1"]);
        const promiseResult2 = yield* Effect.promise(() =>
          client.mutation(
            Ref.getFunctionReference(functions.limitedReadFromMutation),
            { caseId, limit: 10 },
          ),
        );
        expect(promiseResult2).toEqual(["seed-0", "seed-1"]);
        yield* Effect.promise(() =>
          expect(
            client.query(Ref.getFunctionReference(functions.limitedRead), {
              caseId,
              limit: 1,
            }),
          ).rejects.toThrow(/documents read/i),
        );
        yield* Effect.promise(() =>
          expect(
            client.mutation(
              Ref.getFunctionReference(functions.limitedReadFromMutation),
              { caseId, limit: 1 },
            ),
          ).rejects.toThrow(/documents read/i),
        );
      }),
    );

    it.effect("enforces nested mutation write limits", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const caseId = "write-limits";
        yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(functions.seed), {
            caseId,
            count: 0,
          }),
        );
        yield* Effect.promise(() =>
          expect(
            client.mutation(Ref.getFunctionReference(functions.limitedWrite), {
              caseId,
              limit: 0,
            }),
          ).rejects.toThrow(
            "Too many writes in a single function execution (limit: 0)",
          ),
        );
        const promiseResult3 = yield* Effect.promise(() =>
          client.query(Ref.getFunctionReference(functions.limitedRead), {
            caseId,
            limit: 10,
          }),
        );
        expect(promiseResult3).toEqual([]);
        yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(functions.limitedWrite), {
            caseId,
            limit: 1,
          }),
        );
        const promiseResult4 = yield* Effect.promise(() =>
          client.query(Ref.getFunctionReference(functions.limitedRead), {
            caseId,
            limit: 10,
          }),
        );
        expect(promiseResult4).toEqual(["child"]);
      }),
    );

    it.effect(
      "decodes a nested mutation error and rolls back only its writes",
      () =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const caseId = "rollback";
          yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(functions.seed), {
              caseId,
              count: 0,
            }),
          );
          const promiseResult5 = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(functions.rollback), {
              caseId,
            }),
          );
          expect(promiseResult5).toBe(true);
          const promiseResult6 = yield* Effect.promise(() =>
            client.query(Ref.getFunctionReference(functions.limitedRead), {
              caseId,
              limit: 10,
            }),
          );
          expect(promiseResult6).toEqual(["parent"]);
        }),
    );

    it.effect(
      "uses the mutation's pending writes unless a stale snapshot is requested",
      () =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          for (const stale of [false, true]) {
            const caseId = `stale-${stale}`;
            yield* Effect.promise(() =>
              client.mutation(Ref.getFunctionReference(functions.seed), {
                caseId,
                count: 1,
              }),
            );
            const values = yield* Effect.promise(() =>
              client.mutation(Ref.getFunctionReference(functions.staleRead), {
                caseId,
                stale,
              }),
            );
            if (stale) {
              expect(values).not.toContain("uncommitted");
            } else {
              expect(values).toEqual(["seed-0", "uncommitted"]);
            }
          }
        }),
    );
  },
);
