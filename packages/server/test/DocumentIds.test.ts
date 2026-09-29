import { DocumentIds as BarrelDocumentIds } from "@confect/server";
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
    system: { normalizeId: normalize },
  };
  vi.spyOn(native, "normalizeId");
  vi.spyOn(native.system, "normalizeId");
  return native;
};

describe("DocumentIds", () => {
  it("exports the same tag factory through the barrel", () => {
    expect(BarrelDocumentIds.DocumentIds).toBe(DocumentIds.DocumentIds);
  });

  it.effect(
    "keeps schemas and native calls lazy and preserves receivers",
    () => {
      const fields = vi.fn(() => Schema.Struct({ text: Schema.String }));
      const tables = { notes: Table.make(fields)("notes") };
      const databaseSchema = DatabaseSchema.make(tables);
      const native = makeNative();
      const layer = DocumentIds.layer(databaseSchema, native);
      expect(fields).not.toHaveBeenCalled();
      expect(native.normalizeId).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const ids = yield* DocumentIds.DocumentIds<typeof databaseSchema>();
        const parsed = ids.parse("notes", "notes:id");
        const identified = ids.identify("_storage:id");
        const normalized = ids.normalize("_storage", "legacy");
        expect(native.normalizeId).not.toHaveBeenCalled();
        expect(native.system.normalizeId).not.toHaveBeenCalled();
        expect(yield* parsed).toEqual(Option.some("notes:id"));
        expect(yield* parsed).toEqual(Option.some("notes:id"));
        expect(native.normalizeId).toHaveBeenCalledTimes(2);
        expect(yield* identified).toEqual(
          Option.some({ table: "_storage", id: "_storage:id" }),
        );
        expect(yield* normalized).toEqual(Option.some("_storage:id"));
        expect(
          vi
            .mocked(native.normalizeId)
            .mock.contexts.every((ctx) => ctx === native),
        ).toBe(true);
        expect(
          vi
            .mocked(native.system.normalizeId)
            .mock.contexts.every((ctx) => ctx === native.system),
        ).toBe(true);
        expect(fields).not.toHaveBeenCalled();
        expect(DatabaseSchema.tables(databaseSchema)).toBe(tables);
      }).pipe(Effect.provide(layer));
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
        expect(yield* ids.parse(table, input)).toEqual(Option.some(input));
        expect(yield* ids.identify(input)).toEqual(
          Option.some({ table, id: input }),
        );
        expect(yield* ids.normalize(table, input)).toEqual(Option.some(input));
      }),
  );

  it.effect.each(["", "invalid", "unknown:id", "NOTES:ID", " notes:id"])(
    "returns None for unrecognized input %j",
    (input) =>
      Effect.gen(function* () {
        const ids = DocumentIds.make(schema, makeNative());
        expect(yield* ids.parse("notes", input)).toEqual(Option.none());
        expect(yield* ids.identify(input)).toEqual(Option.none());
        expect(yield* ids.normalize("notes", input)).toEqual(Option.none());
      }),
  );

  it.effect(
    "rejects another table's ID and separates legacy conversion from membership",
    () =>
      Effect.gen(function* () {
        const ids = DocumentIds.make(schema, makeNative());
        expect(yield* ids.parse("notes", "users:id")).toEqual(Option.none());
        expect(yield* ids.normalize("notes", "users:id")).toEqual(
          Option.none(),
        );
        expect(yield* ids.parse("notes", "legacy")).toEqual(Option.none());
        expect(yield* ids.identify("legacy")).toEqual(Option.none());
        expect(yield* ids.normalize("notes", "legacy")).toEqual(
          Option.some("notes:id"),
        );
        expect(yield* ids.normalize("users", "legacy")).toEqual(
          Option.some("users:id"),
        );
      }),
  );

  it.effect(
    "searches only known tables, short-circuits, and routes system IDs separately",
    () =>
      Effect.gen(function* () {
        const native = makeNative();
        const ids = DocumentIds.make(schema, native);
        yield* ids.identify("notes:id");
        expect(vi.mocked(native.normalizeId).mock.calls).toEqual([
          ["notes", "notes:id"],
        ]);
        expect(native.system.normalizeId).not.toHaveBeenCalled();
        vi.mocked(native.normalizeId).mockClear();
        yield* ids.identify("missing");
        expect(vi.mocked(native.normalizeId).mock.calls).toEqual([
          ["notes", "missing"],
          ["users", "missing"],
        ]);
        expect(vi.mocked(native.system.normalizeId).mock.calls).toEqual([
          ["_scheduled_functions", "missing"],
          ["_storage", "missing"],
        ]);
      }),
  );

  it.effect("supports public system IDs with an empty application schema", () =>
    Effect.gen(function* () {
      const native = makeNative();
      const ids = DocumentIds.make(DatabaseSchema.make({}), native);
      expect(yield* ids.identify("_storage:id")).toEqual(
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
      expect(
        yield* ids
          .parse("notes", "notes:id")
          .pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(failure);
      expect(
        yield* ids
          .identify("notes:id")
          .pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(failure);
      expect(
        yield* ids
          .normalize("_storage", "legacy")
          .pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(failure);
    }),
  );

  it.effect(
    "preserves table-specific IDs and correlated identification results",
    () =>
      Effect.gen(function* () {
        const ids = yield* DocumentIds.DocumentIds<typeof schema>();
        expectTypeOf(ids.parse("notes", "input")).toEqualTypeOf<
          Effect.Effect<Option.Option<GenericId<"notes">>>
        >();
        expectTypeOf(ids.normalize("_storage", "input")).toEqualTypeOf<
          Effect.Effect<Option.Option<GenericId<"_storage">>>
        >();
        expectTypeOf<"unknown">().not.toExtend<
          Parameters<typeof ids.parse>[0]
        >();
        expectTypeOf<"unknown">().not.toExtend<
          Parameters<typeof ids.normalize>[0]
        >();
        const identified = yield* ids.identify("users:id");
        expectTypeOf(identified).toEqualTypeOf<
          Option.Option<
            DocumentIds.IdentifiedId<
              "notes" | "users" | "_storage" | "_scheduled_functions"
            >
          >
        >();
        expect(Option.isSome(identified)).toBe(true);
        if (Option.isSome(identified) && identified.value.table === "users") {
          expectTypeOf(identified.value.id).toEqualTypeOf<GenericId<"users">>();
        }
      }).pipe(Effect.provide(DocumentIds.layer(schema, makeNative()))),
  );
});
