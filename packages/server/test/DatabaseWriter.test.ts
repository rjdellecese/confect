import { Table } from "@confect/core";
import type * as DataModel from "@confect/server/DataModel";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as DatabaseWriter from "@confect/server/DatabaseWriter";
import type { PatchValue } from "@confect/server/DatabaseWriter";
import * as Document from "@confect/server/Document";
import * as QueryInitializer from "@confect/server/QueryInitializer";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericDatabaseWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

it("omits system fields from full document patch values", () => {
  type Doc = {
    readonly _id: string;
    readonly _creationTime: number;
    readonly text: string;
    readonly label?: string;
  };

  expectTypeOf<PatchValue<Doc>>().toEqualTypeOf<{
    readonly text?: string;
    readonly label?: string | undefined;
  }>();
  expectTypeOf<keyof PatchValue<Doc>>().toEqualTypeOf<"text" | "label">();
});

it("preserves patch semantics for documents without system fields", () => {
  type Fields = {
    text: string;
    label?: string;
    nested: { _id: string; _creationTime: number };
  };

  expectTypeOf<PatchValue<Fields>>().toEqualTypeOf<{
    text?: string;
    label?: string | undefined;
    nested?: { _id: string; _creationTime: number };
  }>();
});

it("preserves union members when omitting system fields", () => {
  type Doc = { _id: string; _creationTime: number } & (
    | { kind: "text"; text: string }
    | { kind: "image"; url: string; caption?: string }
  );

  expectTypeOf<PatchValue<Doc>>().toEqualTypeOf<
    | { kind?: "text"; text?: string }
    | { kind?: "image"; url?: string; caption?: string | undefined }
  >();
});

interface Tree {
  readonly name: string;
  readonly children: ReadonlyArray<Tree>;
}
const Tree: Schema.Codec<Tree> = Schema.Struct({
  name: Schema.String,
  children: Schema.Array(Schema.suspend(() => Tree)),
});

class Point extends Schema.Class<Point>("Point")({ x: Schema.Finite }) {}

const notes = Table.make(() =>
  Schema.Struct({
    text: Schema.String.check(Schema.isMaxLength(10)),
    tag: Schema.optionalKey(Schema.String),
    author: Schema.optional(Schema.String),
    meta: Schema.optionalKey(Schema.Struct({ pinned: Schema.Boolean })),
    status: Schema.optionalKey(Schema.Literals(["draft", "published"])),
    scores: Schema.optionalKey(Schema.Record(Schema.String, Schema.Finite)),
    range: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ low: Schema.Finite }),
        Schema.Struct({ low: Schema.Finite, high: Schema.Finite }),
      ]),
    ),
    body: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
        Schema.Struct({
          kind: Schema.Literal("list"),
          items: Schema.Array(Schema.String),
        }),
      ]),
    ),
    outline: Schema.optionalKey(Tree),
  }),
)("notes");

// Tables whose patches cannot be encoded field by field: a transformation in a
// field, nested in one, or behind `suspend`; a check on the struct itself; a
// declaration; a recursion the walk cannot close; a union of documents.
const counters = Table.make(() =>
  Schema.Struct({ count: Schema.FiniteFromString }),
)("counters");
const tallies = Table.make(() =>
  Schema.Struct({ counts: Schema.Array(Schema.FiniteFromString) }),
)("tallies");
const totals = Table.make(() =>
  Schema.Struct({ total: Schema.suspend(() => Schema.FiniteFromString) }),
)("totals");
const ranges = Table.make(() =>
  Schema.Struct({ low: Schema.Finite, high: Schema.Finite }).check(
    Schema.makeFilter(({ low, high }) => low <= high),
  ),
)("ranges");
const points = Table.make(() => Schema.Struct({ point: Point }))("points");
// Its thunk builds the schema anew on every call, so walking it never meets a
// node twice.
const branch = (): Schema.Codec<Tree> =>
  Schema.Struct({
    name: Schema.String,
    children: Schema.Array(Schema.suspend(branch)),
  });
const branches = Table.make(() => Schema.Struct({ root: branch() }))(
  "branches",
);
const shapes = Table.make(() =>
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("circle"), radius: Schema.Finite }),
    Schema.Struct({ kind: Schema.Literal("square"), side: Schema.Finite }),
  ]),
)("shapes");

const databaseSchema = DatabaseSchema.make({
  notes,
  counters,
  tallies,
  totals,
  ranges,
  points,
  branches,
  shapes,
});
type ConvexDataModel = DataModel.ToConvex<
  DataModel.FromSchema<typeof databaseSchema>
>;

type StoredDocument = {
  readonly _id: string;
  readonly _creationTime: number;
} & Record<string, unknown>;

/**
 * A `DatabaseWriter` over an in-memory `ctx.db` holding `documents`, recording
 * each call it receives. `patch` merges as Convex's does, removing fields set
 * to `undefined` and rejecting a missing document; `failures` makes `patch` or
 * `replace` reject instead.
 */
const writerOver = (
  documents: ReadonlyArray<StoredDocument>,
  failures: { readonly patch?: Error; readonly replace?: Error } = {},
) => {
  const stored = new Map(documents.map((document) => [document._id, document]));
  const calls: Array<ReadonlyArray<unknown>> = [];
  const db = {
    get: (id: string) => {
      calls.push(["get", id]);
      return Promise.resolve(stored.get(id) ?? null);
    },
    patch: (table: string, id: string, value: Record<string, unknown>) => {
      calls.push(["patch", table, id, value]);
      const document = stored.get(id);
      if (failures.patch) return Promise.reject(failures.patch);
      if (document === undefined) {
        return Promise.reject(
          new Error(`Update on nonexistent document ID ${id}`),
        );
      }
      const next: Record<string, unknown> = { ...document };
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete next[key];
        else next[key] = field;
      }
      stored.set(id, next as StoredDocument);
      return Promise.resolve();
    },
    replace: (id: string, value: Record<string, unknown>) => {
      calls.push(["replace", id, value]);
      if (failures.replace) return Promise.reject(failures.replace);
      const { _id, _creationTime } = stored.get(id)!;
      stored.set(id, { ...value, _id, _creationTime });
      return Promise.resolve();
    },
  };
  return {
    calls,
    stored,
    writer: DatabaseWriter.make(
      databaseSchema,
      db as unknown as GenericDatabaseWriter<ConvexDataModel>,
    ),
  };
};

const id = "document-id";
const noteId = id as GenericId<"notes">;
const note: StoredDocument = {
  _id: id,
  _creationTime: 1,
  text: "Draft",
  tag: "inbox",
  meta: { pinned: false },
};

describe("DatabaseWriter.patch", () => {
  it.effect(
    "patches only the patched fields, encoded, without reading the document",
    () =>
      Effect.gen(function* () {
        const { calls, stored, writer } = writerOver([note]);

        yield* writer.table("notes").patch(noteId, {
          text: "Final",
          // `extra` is not a field of `meta`: encoding drops it, as encoding
          // the whole document does.
          meta: { pinned: true, extra: 1 } as { pinned: boolean },
        });

        expect(calls).toStrictEqual([
          ["patch", "notes", id, { text: "Final", meta: { pinned: true } }],
        ]);
        expect(stored.get(id)).toStrictEqual({
          ...note,
          text: "Final",
          meta: { pinned: true },
        });
      }),
  );

  it.effect("unsets optional fields patched to undefined", () =>
    Effect.gen(function* () {
      const { calls, stored, writer } = writerOver([
        { ...note, author: "Ada" },
      ]);

      yield* writer
        .table("notes")
        .patch(noteId, { tag: undefined, author: undefined });

      expect(calls).toStrictEqual([
        ["patch", "notes", id, { tag: undefined, author: undefined }],
      ]);
      expect(stored.get(id)).toStrictEqual({
        _id: id,
        _creationTime: 1,
        text: "Draft",
        meta: { pinned: false },
      });
    }),
  );

  it.effect.each([
    { fields: "a literal", patch: { status: "published" } },
    { fields: "a record", patch: { scores: { a: 1, b: 2 } } },
    {
      fields: "a struct with a key it does not declare",
      patch: { meta: { pinned: true, extra: 1 } },
    },
    { fields: "a union", patch: { body: { kind: "list", items: ["a"] } } },
    {
      fields: "a recursive struct",
      patch: {
        outline: { name: "root", children: [{ name: "leaf", children: [] }] },
      },
    },
    {
      fields: "several",
      patch: { text: "Final", tag: undefined, status: "draft" },
    },
  ] as const)(
    "stores what get and replace store when patching $fields",
    ({ patch }) =>
      Effect.gen(function* () {
        const patched = writerOver([note]);
        const replaced = writerOver([note], { patch: new Error("rejected") });

        yield* patched.writer.table("notes").patch(noteId, patch);
        yield* replaced.writer.table("notes").patch(noteId, patch);

        expect(patched.calls.map(([method]) => method)).toEqual(["patch"]);
        expect(replaced.calls.map(([method]) => method)).toEqual([
          "patch",
          "get",
          "replace",
        ]);
        expect(patched.stored.get(id)).toStrictEqual(replaced.stored.get(id));
      }),
  );

  it.effect(
    "patches a document whose other field fails its check, which get and replace refused",
    () =>
      Effect.gen(function* () {
        const invalid = { ...note, text: "Longer than ten" };
        const patched = writerOver([invalid]);
        const replaced = writerOver([invalid], {
          patch: new Error("rejected"),
        });

        yield* patched.writer.table("notes").patch(noteId, { tag: "done" });
        const error = yield* replaced.writer
          .table("notes")
          .patch(noteId, { tag: "done" })
          .pipe(Effect.flip);

        expect(patched.stored.get(id)).toStrictEqual({
          ...invalid,
          tag: "done",
        });
        assert.instanceOf(error, Document.DocumentDecodeError);
      }),
  );

  it.effect(
    "keeps the keys decoding drops, which get and replace deleted, as Convex's patch does",
    () =>
      Effect.gen(function* () {
        // The stored `range` is the union's second member, but decoding
        // matches the first, which drops `high`.
        const stored = { ...note, range: { low: 1, high: 2 } };
        const patched = writerOver([stored]);
        const replaced = writerOver([stored], {
          patch: new Error("rejected"),
        });

        yield* patched.writer.table("notes").patch(noteId, { tag: "done" });
        yield* replaced.writer.table("notes").patch(noteId, { tag: "done" });

        expect(patched.stored.get(id)).toStrictEqual({
          ...stored,
          tag: "done",
        });
        expect(replaced.stored.get(id)).toStrictEqual({
          ...stored,
          tag: "done",
          range: { low: 1 },
        });
      }),
  );

  it.effect.each([
    {
      reason: "a field transforms",
      table: "counters",
      fields: { count: "1" },
      patch: { count: 2 },
      replaced: { count: "2" },
    },
    {
      reason: "an array's elements transform",
      table: "tallies",
      fields: { counts: ["1"] },
      patch: { counts: [3] },
      replaced: { counts: ["3"] },
    },
    {
      reason: "a suspended field transforms",
      table: "totals",
      fields: { total: "1" },
      patch: { total: 2 },
      replaced: { total: "2" },
    },
    {
      reason: "the struct is checked",
      table: "ranges",
      fields: { low: 1, high: 3 },
      patch: { high: 5 },
      replaced: { low: 1, high: 5 },
    },
    {
      reason: "a field is a declaration",
      table: "points",
      fields: { point: { x: 1 } },
      patch: { point: new Point({ x: 2 }) },
      replaced: { point: { x: 2 } },
    },
    {
      reason: "a suspended schema is built anew on every call",
      table: "branches",
      fields: { root: { name: "a", children: [] } },
      patch: { root: { name: "b", children: [] } },
      replaced: { root: { name: "b", children: [] } },
    },
    {
      reason: "the table is a union",
      table: "shapes",
      fields: { kind: "circle", radius: 1 },
      patch: { radius: 2 },
      replaced: { kind: "circle", radius: 2 },
    },
    {
      reason: "the patch has a key the table does not declare",
      table: "notes",
      fields: { text: "Draft" },
      patch: { text: "Final", stray: 1 },
      replaced: { text: "Final" },
    },
  ] as const)(
    "gets and replaces the document where $reason",
    ({ table, fields, patch, replaced }) =>
      Effect.gen(function* () {
        const { calls, writer } = writerOver([
          { _id: id, _creationTime: 1, ...fields },
        ]);

        yield* writer
          .table(table)
          .patch(id as GenericId<typeof table>, patch as never);

        expect(calls).toStrictEqual([
          ["get", id],
          ["replace", id, replaced],
        ]);
      }),
  );

  it.effect.each([
    { value: "a value that does not encode", patch: { text: 42 } },
    {
      value: "a value that fails its check",
      patch: { text: "Longer than ten" },
    },
    { value: "undefined for a required field", patch: { text: undefined } },
  ])("fails $value with the error get and replace give", ({ patch }) =>
    Effect.gen(function* () {
      const { calls, writer } = writerOver([note]);

      const error = yield* writer
        .table("notes")
        .patch(noteId, patch as never)
        .pipe(Effect.flip);

      const merged: Record<string, unknown> = { ...note, ...patch };
      if (patch.text === undefined) delete merged["text"];
      const expected = yield* Document.encode(merged as never, notes).pipe(
        Effect.flip,
      );
      assert.instanceOf(error, Document.DocumentEncodeError);
      expect(error).toEqual(expected);
      expect(calls).toStrictEqual([["get", id]]);
    }),
  );

  it.effect("fails a missing document with GetByIdFailure", () =>
    Effect.gen(function* () {
      const { calls, writer } = writerOver([]);

      const error = yield* writer
        .table("notes")
        .patch(noteId, { text: "Final" })
        .pipe(Effect.flip);

      assert.instanceOf(error, QueryInitializer.GetByIdFailure);
      expect(error).toMatchObject({ tableName: "notes", id });
      expect(calls).toStrictEqual([
        ["patch", "notes", id, { text: "Final" }],
        ["get", id],
      ]);
    }),
  );

  it.effect("fails a patch Convex rejects with the replace failure", () =>
    Effect.gen(function* () {
      const failures = {
        patch: new Error("patch rejected"),
        replace: new Error("replace rejected"),
      };
      const { calls, writer } = writerOver([note], failures);

      const exit = yield* writer
        .table("notes")
        .patch(noteId, { text: "Final" })
        .pipe(Effect.exit);

      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBe(failures.replace);
      }
      expect(calls).toStrictEqual([
        ["patch", "notes", id, { text: "Final" }],
        ["get", id],
        [
          "replace",
          id,
          { text: "Final", tag: "inbox", meta: { pinned: false } },
        ],
      ]);
    }),
  );
});
