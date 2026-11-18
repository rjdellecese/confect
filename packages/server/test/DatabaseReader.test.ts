import * as DatabaseReader from "@confect/server/DatabaseReader";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import type * as DataModel from "@confect/server/DataModel";
import * as Table from "@confect/server/Table";
import { expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericDatabaseReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const notes = Table.make(() =>
  Schema.Struct({ score: Schema.FiniteFromString }),
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
    const storage = yield* reader.table(Table.storageTable).get(storageId);
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
      reader.table(Table.scheduledFunctionsTable).index("by_creation_time"),
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
