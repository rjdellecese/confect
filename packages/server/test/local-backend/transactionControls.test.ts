import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

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
        expect(
          yield* Effect.promise(() =>
            client.query(Ref.getFunctionReference(functions.limitedRead), {
              caseId,
              limit: 10,
            }),
          ),
        ).toEqual(["seed-0", "seed-1"]);
        expect(
          yield* Effect.promise(() =>
            client.mutation(
              Ref.getFunctionReference(functions.limitedReadFromMutation),
              { caseId, limit: 10 },
            ),
          ),
        ).toEqual(["seed-0", "seed-1"]);
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
        expect(
          yield* Effect.promise(() =>
            client.query(Ref.getFunctionReference(functions.limitedRead), {
              caseId,
              limit: 10,
            }),
          ),
        ).toEqual([]);
        yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(functions.limitedWrite), {
            caseId,
            limit: 1,
          }),
        );
        expect(
          yield* Effect.promise(() =>
            client.query(Ref.getFunctionReference(functions.limitedRead), {
              caseId,
              limit: 10,
            }),
          ),
        ).toEqual(["child"]);
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
          expect(
            yield* Effect.promise(() =>
              client.mutation(Ref.getFunctionReference(functions.rollback), {
                caseId,
              }),
            ),
          ).toBe(true);
          expect(
            yield* Effect.promise(() =>
              client.query(Ref.getFunctionReference(functions.limitedRead), {
                caseId,
                limit: 10,
              }),
            ),
          ).toEqual(["parent"]);
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
