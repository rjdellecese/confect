import * as DatabaseReader from "@confect/server/DatabaseReader";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import type * as DataModel from "@confect/server/DataModel";
import type * as Document from "@confect/server/Document";
import type * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import * as Table from "@confect/server/Table";
import { expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";
import type * as Types from "effect/Types";
import { vi } from "vitest";

const notes = Table.make(() =>
  Schema.Struct({
    score: Schema.FiniteFromString,
    aliases: Schema.optional(Schema.Tuple([Schema.String, Schema.String])),
  }),
).index("by_score", ["score"])("notes");
const users = Table.make(() => Schema.Struct({ name: Schema.String }))("users");
const schema = DatabaseSchema.make({ notes, users });
type NativeReader = GenericDatabaseReader<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schema>>
>;
const noteId = "note" as GenericId<"notes">;

it.effect("reads through the selected handle's codec and native receiver", () =>
  Effect.gen(function* () {
    const storageId = "storage" as GenericId<"_storage">;
    const stored = {
      _id: storageId,
      _creationTime: 2,
      sha256: "hash",
      size: 16,
    };
    const native = {
      get: vi
        .fn<NativeReader["get"]>()
        .mockResolvedValue({ _id: noteId, _creationTime: 1, score: "42" }),
      system: {
        get: vi.fn<NativeReader["system"]["get"]>().mockResolvedValue(stored),
      },
    };
    const reader = DatabaseReader.make(native as unknown as NativeReader);
    const app = yield* reader.table(notes).get(noteId);
    expectTypeOf(app.score).toEqualTypeOf<number>();
    expect(app.score).toBe(42);
    const storage = yield* reader.table(Table._storage).get(storageId);
    expect(storage).toEqual(stored);
    expect(native.get.mock.contexts).toEqual([native]);
    expect(native.system.get.mock.contexts).toEqual([native.system]);
  }),
);

it("infers named documents, indexes and IDs only for app and system handles", () => {
  interface NoteDoc {
    readonly _id: GenericId<"notes">;
    readonly _creationTime: number;
    readonly score: 42;
  }
  const check = (
    reader: DatabaseReader.DatabaseReaderService<
      typeof schema,
      { notes: NoteDoc }
    >,
    native: NativeReader,
    untyped: GenericDatabaseReader<GenericDataModel>,
    selected: typeof notes | typeof users,
  ) => {
    const read = reader
      .table(notes)
      .index("by_score", (q) => q.eq("score", "42"))
      .collect();
    expectTypeOf<Effect.Success<typeof read>>().toEqualTypeOf<
      ReadonlyArray<NoteDoc>
    >();
    expectTypeOf(
      reader.table(Table._scheduled_functions).index("by_creation_time"),
    ).toBeObject();
    const foreign = Table.make(() => Schema.Struct({ field: Schema.String }))(
      "other",
    );
    expectTypeOf(foreign).not.toExtend<Parameters<typeof reader.table>[0]>();
    const incompatible = Table.make(() =>
      Schema.Struct({ field: Schema.String }),
    )("notes");
    expectTypeOf(incompatible).not.toExtend<
      Parameters<typeof reader.table>[0]
    >();
    expectTypeOf<"notes">().not.toExtend<Parameters<typeof reader.table>[0]>();
    const raw = DatabaseReader.make(native);
    expectTypeOf(foreign).not.toExtend<Parameters<typeof raw.table>[0]>();
    // @ts-expect-error The deployed notes do not have the handle's required field.
    raw.table(incompatible);
    const numeric = Table.make(() => Schema.Struct({ score: Schema.Finite }))(
      "notes",
    );
    // @ts-expect-error The native score is a string, not the decoded number.
    raw.table(numeric);
    const optional = Table.make(() =>
      Schema.Struct({ score: Schema.optionalKey(Schema.String) }),
    )("notes");
    expectTypeOf(raw.table(optional).get(noteId)).toBeObject();
    expectTypeOf(raw.table(selected).index("by_creation_time")).toBeObject();
    expectTypeOf(
      DatabaseReader.make(untyped).table(notes).get(noteId),
    ).toBeObject();
    // @ts-expect-error The users table has no score index.
    reader.table(users).index("by_score");
    // @ts-expect-error The selected table may be users.
    expectTypeOf(reader.table(selected).get(noteId));
    if (selected.tableName === "notes") {
      const note = reader.table(selected).get(noteId);
      expectTypeOf<Effect.Success<typeof note>>().toEqualTypeOf<NoteDoc>();
    }
    // @ts-expect-error A note ID is not a user ID.
    expectTypeOf(reader.table(users).get(noteId));
  };
  expectTypeOf(check).toBeFunction();
});

it("reads a shared index without losing the document union or stream layout", () => {
  const members = Table.make(() =>
    Schema.Struct({ name: Schema.String, age: Schema.Finite }),
  )
    .index("shared", ["name"])
    .index("by_value", ["age"])("members");
  const teams = Table.make(() =>
    Schema.Struct({ name: Schema.String, rank: Schema.Finite }),
  )
    .index("shared", ["name"])
    .index("by_value", ["rank"])
    .index("by_rank", ["rank"])("teams");
  const app = DatabaseSchema.make({ members, teams });
  interface NamedMember extends Omit<typeof members.Doc.Type, "name"> {
    readonly name: "named member";
  }
  type MatchedDoc = NamedMember | Document.Document<typeof app, "teams">;
  const check = (
    reader: DatabaseReader.DatabaseReaderService<
      typeof app,
      { members: NamedMember }
    >,
    selected: typeof members | typeof teams,
  ) => {
    const table = reader.table(selected);
    const docs = table.index("by_creation_time").collect();
    expectTypeOf<Effect.Success<typeof docs>>().toEqualTypeOf<
      ReadonlyArray<MatchedDoc>
    >();
    expectTypeOf(table.index("by_value", "desc").first()).toBeObject();
    const shared = table.stream("shared", "desc");
    expectTypeOf<Stream.Success<typeof shared>>().toEqualTypeOf<MatchedDoc>();
    expectTypeOf(shared.orderDirection).toEqualTypeOf<"desc">();
    expectTypeOf<
      Types.Invariant.Type<(typeof shared)["~labels"]>
    >().toEqualTypeOf<
      QueryStreamKeyLabels.QueryStreamKeyLabels<
        readonly ["name", "_creationTime"]
      >
    >();
    const creation = table.stream("by_creation_time");
    expectTypeOf(creation.orderDirection).toEqualTypeOf<"asc">();
    // @ts-expect-error The runtime table may have a different stream key layout.
    expectTypeOf(table.stream("by_value"));
    // @ts-expect-error Only teams has this index.
    table.index("by_rank");
    // @ts-expect-error A range for one table cannot be used for both.
    table.index("by_value", (q) => q.eq("rank", 1));
    // @ts-expect-error A range for one table cannot be used for both.
    expectTypeOf(table.stream("by_value", (q) => q.eq("rank", 1)));
  };
  expectTypeOf(check).toBeFunction();
});

it("does not expose indexes from a different app's structurally compatible handle", () => {
  const otherUsers = Table.make(() => Schema.Struct({ name: Schema.String }))
    .index("by_name", ["name"])
    .searchIndex("text", { searchField: "name" })("users");
  const check = (
    reader: DatabaseReader.DatabaseReaderService<typeof schema>,
    native: NativeReader,
  ) => {
    const table = reader.table(otherUsers);
    expectTypeOf(table.index("by_creation_time")).toBeObject();
    // @ts-expect-error The deployed users table has no by_name index.
    table.index("by_name");
    // @ts-expect-error The deployed users table has no text search index.
    table.search("text", (q) => q.search("name", "Ada"));
    // @ts-expect-error The handle declares indexes missing from the native model.
    DatabaseReader.make(native).table(otherUsers);
  };
  expectTypeOf(check).toBeFunction();
});
