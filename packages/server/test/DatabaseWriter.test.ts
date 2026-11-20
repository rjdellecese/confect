import type { PatchValue } from "@confect/server/DatabaseWriter";
import * as DatabaseWriter from "@confect/server/DatabaseWriter";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import type * as DataModel from "@confect/server/DataModel";
import * as Table from "@confect/server/Table";
import { expectTypeOf, it } from "@effect/vitest";
import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import type { GenericId } from "convex/values";
import type * as Effect from "effect/Effect";
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

it("accepts only documents and IDs for the selected application handle", () => {
  const notes = Table.make(() =>
    Schema.Struct({
      score: Schema.FiniteFromString,
      aliases: Schema.String.pipe(Schema.Array, Schema.optional),
    }),
  )("notes");
  const users = Table.make(() => Schema.Struct({ name: Schema.String }))(
    "users",
  );
  const schema = DatabaseSchema.make({ notes, users });
  type Model = DataModel.ToConvexDataModel<
    DataModel.FromDatabaseSchema<typeof schema>
  >;
  const check = (
    writer: DatabaseWriter.DatabaseWriterService<typeof schema>,
    native: GenericDatabaseWriter<Model>,
    untyped: GenericDatabaseWriter<GenericDataModel>,
    selected: typeof notes | typeof users,
    noteId: GenericId<"notes">,
  ) => {
    const inserted = writer.table(notes).insert({ score: 42 });
    expectTypeOf<Effect.Success<typeof inserted>>().toEqualTypeOf<
      GenericId<"notes">
    >();
    const foreign = Table.make(() => Schema.Struct({ prefix: Schema.String }))(
      "other",
    );
    expectTypeOf(foreign).not.toExtend<Parameters<typeof writer.table>[0]>();
    expectTypeOf<"notes">().not.toExtend<Parameters<typeof writer.table>[0]>();
    const raw = DatabaseWriter.make(native);
    expectTypeOf(raw).toExtend<
      DatabaseWriter.DatabaseWriterService<typeof schema>
    >();
    const selectNote = <T extends typeof notes>(table: T) => raw.table(table);
    expectTypeOf(selectNote(notes).insert({ score: 42 })).toBeObject();
    const uncertain = Table.make(() => Schema.Struct({ score: Schema.String }))(
      selected.tableName,
    );
    // @ts-expect-error The selected table may require a user name rather than a score.
    raw.table(uncertain);
    expectTypeOf(foreign).not.toExtend<Parameters<typeof raw.table>[0]>();
    const incompatible = Table.make(() =>
      Schema.Struct({ field: Schema.String }),
    )("notes");
    // @ts-expect-error The handle does not encode the required score.
    raw.table(incompatible);
    const numeric = Table.make(() => Schema.Struct({ score: Schema.Finite }))(
      "notes",
    );
    // @ts-expect-error The deployed score is a string, not the decoded number.
    raw.table(numeric);
    const literal = Table.make(() =>
      Schema.Struct({ score: Schema.Literal("42") }),
    )("notes");
    expectTypeOf(raw.table(literal).insert({ score: "42" })).toBeObject();
    expectTypeOf(raw.table(notes).insert({ score: 42 })).toBeObject();
    expectTypeOf(
      DatabaseWriter.make(untyped).table(notes).insert({ score: 42 }),
    ).toBeObject();
    expectTypeOf(Table._storage).not.toExtend<
      Parameters<typeof writer.table>[0]
    >();
    // @ts-expect-error System tables are read-only even with an untyped native writer.
    DatabaseWriter.make(untyped).table(Table._storage);
    // @ts-expect-error The writer accepts decoded values.
    expectTypeOf(writer.table(notes).insert({ score: "42" }));
    // @ts-expect-error The selected table may be users.
    expectTypeOf(writer.table(selected).insert({ score: 42 }));
    // @ts-expect-error The ID may not belong to the selected table.
    expectTypeOf(writer.table(selected).delete(noteId));
    // @ts-expect-error A note ID cannot replace a user.
    expectTypeOf(writer.table(users).replace(noteId, { name: "Ada" }));
  };
  expectTypeOf(check).toBeFunction();
});
