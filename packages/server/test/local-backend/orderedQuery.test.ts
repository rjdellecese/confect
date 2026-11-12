import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import refs from "confect-local-backend/refs";
import * as LocalBackend from "confect-local-backend/LocalBackend";

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "native ordered query filters",
  (it) => {
    it.effect(
      "filters before terminals and decoding without skipping backend reads",
      () =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const functions = refs.public.groups.orderedQueries;
          yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(functions.seed), {}),
          );
          for (const terminal of [
            "first",
            "take",
            "collect",
            "stream",
          ] as const) {
            const result = yield* Effect.promise(() =>
              client.query(Ref.getFunctionReference(functions.read), {
                terminal,
                empty: false,
              }),
            );
            expect(result.values).toEqual(terminal === "first" ? [2] : [2, 3]);
            expect(result.repeated).toEqual(result.values);
            expect(result.reads).toBeGreaterThan(result.values.length);
            const empty = yield* Effect.promise(() =>
              client.query(Ref.getFunctionReference(functions.read), {
                terminal,
                empty: true,
              }),
            );
            expect(empty.values).toEqual([]);
            expect(empty.repeated).toEqual([]);
          }
          const page = Ref.getFunctionReference(functions.page);
          const first = yield* Effect.promise(() =>
            client.query(page, {
              paginationOpts: { numItems: 1, cursor: null },
              extra: false,
            }),
          );
          expect(first.values).toEqual([2]);
          const next = yield* Effect.promise(() =>
            client.query(page, {
              paginationOpts: { numItems: 1, cursor: first.continueCursor },
              extra: false,
            }),
          );
          expect(next.values).toEqual([3]);
          const combined = yield* Effect.promise(() =>
            client.query(page, {
              paginationOpts: { numItems: 1, cursor: null },
              extra: true,
            }),
          );
          expect(combined.values).toEqual([3]);
          const limited = yield* Effect.promise(() =>
            client.query(page, {
              paginationOpts: { numItems: 1, cursor: null, maximumRowsRead: 1 },
              extra: false,
            }),
          );
          expect(limited.values).toEqual([]);
          expect(limited.isDone).toBe(false);
          expect(limited.reads).toBeGreaterThan(0);
          const resumed = yield* Effect.promise(() =>
            client.query(page, {
              paginationOpts: { numItems: 1, cursor: limited.continueCursor },
              extra: false,
            }),
          );
          expect(resumed.values).toEqual([2]);
        }),
    );
  },
);
