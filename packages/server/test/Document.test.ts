import type { GenericId } from "@confect/core/GenericId";
import * as Table from "@confect/server/Table";
import * as SystemFields from "@confect/core/SystemFields";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaCompiler from "effect/unstable/schema/SchemaCompiler";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Document from "@confect/server/Document";
import type * as TableInfo from "@confect/server/TableInfo";
import unnamedEvents from "./mock-backend/fixtures/confect/tables/events";

const NoteSchema = Schema.Struct({
  content: Schema.String,
});

const notes = Table.make(() => NoteSchema)("notes");

const convexNote = {
  content: "Hello, world!",
  _id: "abc123" as GenericId<"notes">,
  _creationTime: 1_234_567_890,
};

const decodeUncached = (
  tableName: "notes",
  tableSchema: typeof NoteSchema,
  convexDocument: typeof convexNote,
) =>
  Schema.decodeSync(
    SystemFields.extendWithSystemFields(tableName, tableSchema),
  )(convexDocument);

const encodeUncached = (
  tableSchema: typeof NoteSchema,
  document: ReturnType<typeof decodeUncached>,
) => Schema.encodeSync(tableSchema)(document);

describe("Document.decode", () => {
  it.effect("uses the decoder installed for the bound table Doc lazily", () =>
    Effect.gen(function* () {
      let evaluations = 0;
      const table = Table.make(() => {
        evaluations++;
        return NoteSchema;
      })("notes");
      const decode = Document.decode(table);

      expect(evaluations).toBe(0);

      const doc = table.Doc;
      const interpreted = SchemaParser.decodeUnknownEffect(doc);
      yield* interpreted(convexNote);
      let calls = 0;
      SchemaCompiler.set(doc.ast, {
        decodeEffect: (input, options) => {
          calls++;
          return interpreted(input, options);
        },
      });

      expect(yield* decode(convexNote)).toEqual(convexNote);
      expect(yield* decode(convexNote)).toEqual(convexNote);
      expect(calls).toBe(2);
      expect(evaluations).toBe(1);
      expect(table.Doc).toBe(doc);
    }),
  );

  it.effect("decodes documents identically to an uncached decoder", () =>
    Effect.gen(function* () {
      const expected = decodeUncached("notes", NoteSchema, convexNote);

      const decoded = yield* Document.decode(convexNote, notes);

      expect(decoded).toEqual(expected);
    }),
  );

  it.effect(
    "returns the same output when decoding repeatedly with the same table schema",
    () =>
      Effect.gen(function* () {
        const first = yield* Document.decode(convexNote, notes);
        const second = yield* Document.decode(convexNote, notes);
        const third = yield* Document.decode(convexNote, notes);

        expect(second).toEqual(first);
        expect(third).toEqual(first);
      }),
  );

  it.effect(
    "decodes each table name with its own cached decoder when the schema is shared",
    () =>
      Effect.gen(function* () {
        const SharedSchema = Schema.Struct({
          content: Schema.String,
        });

        const convexPost = {
          content: "A post",
          _id: "post456" as GenericId<"posts">,
          _creationTime: 9_876_543_210,
        };

        yield* Document.decode(
          convexNote,
          Table.make(() => SharedSchema)("notes"),
        );

        const decodedPost = yield* Document.decode(
          convexPost,
          Table.make(() => SharedSchema)("posts"),
        );

        const expectedPost = yield* Schema.decodeEffect(
          SystemFields.extendWithSystemFields("posts", SharedSchema),
        )(convexPost);

        expect(decodedPost).toEqual(expectedPost);
      }),
  );

  it.effect("fails with DocumentDecodeError for invalid documents", () =>
    Effect.gen(function* () {
      const invalidNote = {
        ...convexNote,
        content: 123,
      };

      const result = yield* Effect.result(
        Document.decode<Table.AnyWithProps>(notes)(invalidNote),
      );
      if (Result.isSuccess(result)) {
        throw new Error("expected document decoding to fail");
      }
      const error = result.failure;

      expect(error).toBeInstanceOf(Document.DocumentDecodeError);
      expect(error.tableName).toBe("notes");
      expect(error.id).toBe(convexNote._id);
    }),
  );
});

describe("Document.encode", () => {
  it.effect("defers Fields until encoding and leaves Doc unmaterialized", () =>
    Effect.gen(function* () {
      let evaluations = 0;
      const table = Table.make(() => {
        evaluations++;
        return Schema.Struct({ amount: Schema.FiniteFromString });
      })("payments");
      const encode = Document.encode(table);

      expect(evaluations).toBe(0);
      expect(yield* encode({ amount: 12 })).toEqual({ amount: "12" });
      expect(yield* encode({ amount: 34 })).toEqual({ amount: "34" });
      expect(evaluations).toBe(1);
      expect(Object.getOwnPropertyDescriptor(table, "Doc")).toHaveProperty(
        "get",
        expect.any(Function),
      );
    }),
  );

  it.effect(
    "reports encoding errors with the bound table name and document ID",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Document.encode<Table.AnyWithProps>(notes)({
            ...convexNote,
            content: 42,
          }).pipe(Effect.asVoid),
        );
        expect(error).toBeInstanceOf(Document.DocumentEncodeError);
        expect(error.tableName).toBe(notes.tableName);
        expect(error.id).toBe(convexNote._id);
      }),
  );

  it.effect("encodes documents identically to an uncached encoder", () =>
    Effect.gen(function* () {
      const decoded = decodeUncached("notes", NoteSchema, convexNote);
      const expected = encodeUncached(NoteSchema, decoded);

      const encoded = yield* Document.encode(decoded, notes);

      expect(encoded).toEqual(expected);
    }),
  );

  it.effect(
    "returns the same output when encoding repeatedly with the same table schema",
    () =>
      Effect.gen(function* () {
        const decoded = decodeUncached("notes", NoteSchema, convexNote);

        const first = yield* Document.encode(decoded, notes);
        const second = yield* Document.encode(decoded, notes);
        const third = yield* Document.encode(decoded, notes);

        expect(second).toEqual(first);
        expect(third).toEqual(first);
      }),
  );
});

describe("Document.Document", () => {
  it("derives codec input and output types from the bound table", () => {
    const payments = Table.make(() =>
      Schema.Struct({ amount: Schema.FiniteFromString }),
    )("payments");
    const decode = Document.decode(payments);
    const encode = Document.encode(payments);

    expectTypeOf<Effect.Success<ReturnType<typeof decode>>>().toEqualTypeOf<
      TableInfo.TableInfo<typeof payments>["document"]
    >();
    expectTypeOf(decode).parameter(0).toExtend<{
      readonly amount: string;
      readonly _id: GenericId<"payments">;
      readonly _creationTime: number;
    }>();
    expectTypeOf(encode)
      .parameter(0)
      .toEqualTypeOf<{ readonly amount: number }>();
    expectTypeOf<Effect.Success<ReturnType<typeof encode>>>().toEqualTypeOf<{
      readonly amount: string;
    }>();
  });

  it("distributes system fields over union-schema tables", () => {
    const events = unnamedEvents("events");
    type Doc = TableInfo.TableInfo<typeof events>["document"];

    expectTypeOf<Document.WithoutSystemFields<Doc>>().toEqualTypeOf<
      | { readonly kind: "a"; readonly a: string }
      | { readonly kind: "b"; readonly b: number }
    >();
  });
});
