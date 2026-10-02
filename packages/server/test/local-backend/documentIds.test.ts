import { Ref } from "@confect/core";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "DocumentIds inside the Convex isolate",
  (it) => {
    it.effect(
      "identifies deleted document IDs in queries and mutations without requiring existence",
      () =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const functions = refs.public.groups.documentIds;
          const id = yield* Effect.promise(() =>
            client.mutation(
              Ref.getFunctionReference(functions.createAndDelete),
              {},
            ),
          );
          const expected = {
            parsed: id,
            normalized: id,
            identified: { table: "transactionNotes", id },
          };
          expect(
            yield* Effect.promise(() =>
              client.query(Ref.getFunctionReference(functions.inspect), {
                table: "transactionNotes",
                input: id,
              }),
            ),
          ).toEqual(expected);
          expect(
            yield* Effect.promise(() =>
              client.mutation(
                Ref.getFunctionReference(functions.inspectFromMutation),
                { table: "transactionNotes", input: id },
              ),
            ),
          ).toEqual(expected);
        }),
    );

    it.effect.each([
      "transactionNotes",
      "_storage",
      "_scheduled_functions",
    ] as const)(
      "keeps legacy conversion separate from strict %s membership",
      (table) =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const inspect = Ref.getFunctionReference(
            refs.public.groups.documentIds.inspect,
          );
          const legacy = yield* Effect.promise(() =>
            client.query(inspect, { table, input: "LZ_YyWnYaZSFKTnOpihMPA" }),
          );
          expect(legacy.parsed).toBeNull();
          expect(legacy.identified).toBeNull();
          assert(legacy.normalized !== null);
          const input = legacy.normalized;
          expect(
            yield* Effect.promise(() =>
              client.query(inspect, { table, input }),
            ),
          ).toEqual({
            parsed: input,
            normalized: input,
            identified: { table, id: input },
          });
          const wrongTable =
            table === "_storage" ? "transactionNotes" : "_storage";
          expect(
            yield* Effect.promise(() =>
              client.query(inspect, { table: wrongTable, input }),
            ),
          ).toEqual({
            parsed: null,
            normalized: null,
            identified: { table, id: input },
          });
        }),
    );

    it.effect.each(["", "not-an-id"])(
      "returns None for malformed input %j",
      (input) =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          expect(
            yield* Effect.promise(() =>
              client.query(
                Ref.getFunctionReference(
                  refs.public.groups.documentIds.inspect,
                ),
                { table: "transactionNotes", input },
              ),
            ),
          ).toEqual({
            parsed: null,
            normalized: null,
            identified: null,
          });
        }),
    );
  },
);
