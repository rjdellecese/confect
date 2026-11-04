import * as Layer from "effect/Layer";
import * as Arr from "effect/Array";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as DocumentIds from "@confect/server/DocumentIds";
import * as Table from "@confect/server/Table";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const schema = DatabaseSchema.make({
  notes: Table.make(() => Schema.Struct({ text: Schema.String }))("notes"),
  users: Table.make(() => Schema.Struct({ name: Schema.String }))("users"),
});

const makeNative = () => {
  const normalize = <Name extends string>(
    table: Name,
    input: string,
  ): GenericId<Name> | null =>
    input === `${table}:id` || input === "legacy"
      ? (`${table}:id` as GenericId<Name>)
      : null;
  const native = {
    normalizeId: normalize,
    get: () => {
      throw new Error("DocumentIds must not fetch documents");
    },
    query: () => {
      throw new Error("DocumentIds must not query documents");
    },
    system: {
      normalizeId: normalize,
      get: () => {
        throw new Error("DocumentIds must not fetch system documents");
      },
      query: () => {
        throw new Error("DocumentIds must not query system documents");
      },
    },
  };
  vi.spyOn(native, "normalizeId");
  vi.spyOn(native.system, "normalizeId");
  return native;
};

describe("DocumentIds", () => {
  it.effect(
    "keeps schemas and native calls lazy and preserves receivers",
    () => {
      const fields = vi.fn(() => Schema.Struct({ text: Schema.String }));
      const databaseSchema = DatabaseSchema.make({
        notes: Table.make(fields)("notes"),
      });
      const native = makeNative();
      const layer = DocumentIds.layer(databaseSchema, native);
      expect(fields).not.toHaveBeenCalled();
      expect(native.normalizeId).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const services = yield* Layer.build(layer);
        return yield* Effect.gen(function* () {
          const ids = yield* DocumentIds.DocumentIds<typeof databaseSchema>();
          const parsed = ids.parse("notes", "notes:id");
          const identified = ids.identify("_storage:id");
          expect(native.normalizeId).not.toHaveBeenCalled();
          expect(native.system.normalizeId).not.toHaveBeenCalled();
          const parsedResult = yield* parsed;
          expect(parsedResult).toEqual(Option.some("notes:id"));
          const parsedResult2 = yield* parsed;
          expect(parsedResult2).toEqual(Option.some("notes:id"));
          expect(native.normalizeId).toHaveBeenCalledTimes(2);
          const identifiedResult = yield* identified;
          expect(identifiedResult).toEqual(
            Option.some({ table: "_storage", id: "_storage:id" }),
          );
          expect(
            Arr.every(
              vi.mocked(native.normalizeId).mock.contexts,
              (ctx) => ctx === native,
            ),
          ).toBe(true);
          expect(
            Arr.every(
              vi.mocked(native.system.normalizeId).mock.contexts,
              (ctx) => ctx === native.system,
            ),
          ).toBe(true);
          expect(fields).not.toHaveBeenCalled();
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect.each([
    "notes",
    "users",
    "_storage",
    "_scheduled_functions",
  ] as const)(
    "parses and identifies modern %s IDs without conversion",
    (table) =>
      Effect.gen(function* () {
        const ids = DocumentIds.make(schema, makeNative());
        const input = `${table}:id`;
        const parseResult = yield* ids.parse(table, input);
        expect(parseResult).toEqual(Option.some(input));
        const identifyResult = yield* ids.identify(input);
        expect(identifyResult).toEqual(Option.some({ table, id: input }));
      }),
  );

  it.effect.each(["", "invalid", "unknown:id", "NOTES:ID", " notes:id"])(
    "returns None for unrecognized input %j",
    (input) =>
      Effect.gen(function* () {
        const ids = DocumentIds.make(schema, makeNative());
        const parseResult2 = yield* ids.parse("notes", input);
        expect(parseResult2).toEqual(Option.none());
        const identifyResult2 = yield* ids.identify(input);
        expect(identifyResult2).toEqual(Option.none());
      }),
  );

  it.effect(
    "rejects another table's ID and legacy strings requiring conversion",
    () =>
      Effect.gen(function* () {
        const ids = DocumentIds.make(schema, makeNative());
        const parseResult3 = yield* ids.parse("notes", "users:id");
        expect(parseResult3).toEqual(Option.none());
        const parseResult4 = yield* ids.parse("notes", "legacy");
        expect(parseResult4).toEqual(Option.none());
        const identifyResult3 = yield* ids.identify("legacy");
        expect(identifyResult3).toEqual(Option.none());
      }),
  );

  it.effect(
    "searches only known tables, short-circuits, and routes system IDs separately",
    () =>
      Effect.gen(function* () {
        const native = makeNative();
        const ids = DocumentIds.make(schema, native);
        const identifyResult4 = yield* ids.identify("missing");
        expect(identifyResult4).toEqual(Option.none());
        expect(native.normalizeId).toHaveBeenCalledTimes(2);
        expect(vi.mocked(native.normalizeId).mock.calls).toEqual(
          expect.arrayContaining([
            ["notes", "missing"],
            ["users", "missing"],
          ]),
        );
        expect(native.system.normalizeId).toHaveBeenCalledTimes(2);
        expect(vi.mocked(native.system.normalizeId).mock.calls).toEqual(
          expect.arrayContaining([
            ["_scheduled_functions", "missing"],
            ["_storage", "missing"],
          ]),
        );

        const normalize = vi.fn(
          <Name extends string>(_table: Name, input: string): GenericId<Name> =>
            input as GenericId<Name>,
        );
        vi.mocked(native.normalizeId).mockImplementation(normalize);
        vi.mocked(native.system.normalizeId).mockImplementation(normalize);
        const identifyResult5 = yield* ids.identify("matching-id");
        expect(Option.isSome(identifyResult5)).toBe(true);
        expect(normalize).toHaveBeenCalledTimes(1);
      }),
  );

  it.effect("supports public system IDs with an empty application schema", () =>
    Effect.gen(function* () {
      const native = makeNative();
      const ids = DocumentIds.make(DatabaseSchema.make({}), native);
      const identifyResult6 = yield* ids.identify("_storage:id");
      expect(identifyResult6).toEqual(
        Option.some({ table: "_storage", id: "_storage:id" }),
      );
      expect(native.normalizeId).not.toHaveBeenCalled();
      expectTypeOf<Parameters<typeof ids.parse>[0]>().toEqualTypeOf<
        "_storage" | "_scheduled_functions"
      >();
    }),
  );

  it.effect("preserves unexpected native failures as defects", () =>
    Effect.gen(function* () {
      const failure = new Error("native lookup failed");
      const native = makeNative();
      vi.mocked(native.normalizeId).mockImplementation(() => {
        throw failure;
      });
      vi.mocked(native.system.normalizeId).mockImplementation(() => {
        throw failure;
      });
      const ids = DocumentIds.make(schema, native);
      const pipeResult = yield* ids
        .parse("notes", "notes:id")
        .pipe(Effect.catchDefect(Effect.succeed));
      expect(pipeResult).toBe(failure);
      const pipeResult2 = yield* ids
        .identify("notes:id")
        .pipe(Effect.catchDefect(Effect.succeed));
      expect(pipeResult2).toBe(failure);
      const pipeResult3 = yield* ids
        .parse("_storage", "_storage:id")
        .pipe(Effect.catchDefect(Effect.succeed));
      expect(pipeResult3).toBe(failure);
    }),
  );

  it.effect(
    "preserves table-specific IDs and correlated identification results",
    () =>
      Effect.gen(function* () {
        const services = yield* Layer.build(
          DocumentIds.layer(schema, makeNative()),
        );
        return yield* Effect.gen(function* () {
          const ids = yield* DocumentIds.DocumentIds<typeof schema>();
          expectTypeOf(ids.parse("notes", "input")).toEqualTypeOf<
            Effect.Effect<Option.Option<GenericId<"notes">>>
          >();
          expectTypeOf(ids.parse("_storage", "input")).toEqualTypeOf<
            Effect.Effect<Option.Option<GenericId<"_storage">>>
          >();
          expectTypeOf<"unknown">().not.toExtend<
            Parameters<typeof ids.parse>[0]
          >();
          expectTypeOf<keyof typeof ids>().toEqualTypeOf<
            "parse" | "identify"
          >();
          const identified = yield* ids.identify("users:id");
          expectTypeOf(identified).toEqualTypeOf<
            Option.Option<
              | { readonly table: "notes"; readonly id: GenericId<"notes"> }
              | { readonly table: "users"; readonly id: GenericId<"users"> }
              | {
                  readonly table: "_storage";
                  readonly id: GenericId<"_storage">;
                }
              | {
                  readonly table: "_scheduled_functions";
                  readonly id: GenericId<"_scheduled_functions">;
                }
            >
          >();
          expect(Option.isSome(identified)).toBe(true);
          if (Option.isSome(identified) && identified.value.table === "users") {
            expectTypeOf(identified.value.id).toEqualTypeOf<
              GenericId<"users">
            >();
          }
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped),
  );
});
