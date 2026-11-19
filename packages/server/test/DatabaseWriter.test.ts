import type { GenericId as ScopedId } from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";
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
    Schema.Struct({ score: Schema.FiniteFromString }),
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
    expectTypeOf(foreign).not.toExtend<Parameters<typeof raw.table>[0]>();
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

it("preserves component IDs through native and generated writers", () => {
  const scope = IdScope.component("notes");
  const notes = Table.make(() => Schema.Struct({ text: Schema.String }))(
    "notes",
    scope,
  );
  const component = DatabaseSchema.make(
    { notes },
    { kind: "component", scope },
  );
  const app = DatabaseSchema.make({
    notes: Table.make(() => Schema.Struct({ text: Schema.String }))("notes"),
  });
  expectTypeOf<DatabaseWriter.DatabaseWriter<typeof app>>().not.toExtend<
    DatabaseWriter.DatabaseWriter<typeof component>
  >();
  expectTypeOf<DatabaseWriter.DatabaseWriter<typeof component>>().not.toExtend<
    DatabaseWriter.DatabaseWriter<typeof app>
  >();
  type Model = DataModel.ToConvexDataModel<
    DataModel.FromDatabaseSchema<typeof component>
  >;
  const check = (
    writer: DatabaseWriter.DatabaseWriterService<typeof component>,
    native: GenericDatabaseWriter<Model>,
    appId: GenericId<"notes">,
  ) => {
    const scoped = DatabaseWriter.make(native, scope);
    const inserted = scoped.table(notes).insert({ text: "test" });
    expectTypeOf<Effect.Success<typeof inserted>>().toEqualTypeOf<
      ScopedId<"notes", typeof scope>
    >();
    expectTypeOf(writer.table(notes).insert({ text: "test" })).toEqualTypeOf<
      typeof inserted
    >();
    // @ts-expect-error An app ID cannot modify a component document.
    expectTypeOf(scoped.table(notes).delete(appId));
    // @ts-expect-error A native adapter defaults to the app namespace.
    DatabaseWriter.make(native).table(notes);
    // @ts-expect-error A component layer must supply its scope.
    DatabaseWriter.layer<typeof component>(native);
  };
  expectTypeOf(check).toBeFunction();
});
