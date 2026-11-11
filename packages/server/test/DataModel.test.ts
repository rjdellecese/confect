import type * as DataModel from "@confect/server/DataModel";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as Table from "@confect/server/Table";
import { expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

it("derives the same data model from a schema record and its table union", () => {
  const notes = Table.make(() => Schema.Struct({ text: Schema.String }))(
    "notes",
  );
  const users = Table.make(() => Schema.Struct({ name: Schema.String }))(
    "users",
  );
  const schema = DatabaseSchema.make({ notes, users });
  type FromDatabaseSchema = DataModel.FromDatabaseSchema<typeof schema>;
  type FromTables = DataModel.FromTables<typeof notes | typeof users>;
  expectTypeOf<DataModel.Tables<FromDatabaseSchema>>().toEqualTypeOf<
    typeof notes | typeof users
  >();
  expectTypeOf<DataModel.Tables<FromTables>>().toEqualTypeOf<
    DataModel.Tables<FromDatabaseSchema>
  >();
  expectTypeOf<
    keyof DataModel.ToConvexDataModel<FromDatabaseSchema>
  >().toEqualTypeOf<"notes" | "users">();
  expectTypeOf<DataModel.ToConvexDataModel<FromDatabaseSchema>>().toEqualTypeOf<
    DataModel.ToConvexDataModel<FromTables>
  >();
  expectTypeOf<
    DataModel.DocumentWithName<FromDatabaseSchema, "notes">["text"]
  >().toEqualTypeOf<string>();
  expectTypeOf<"~Tables">().not.toExtend<keyof FromDatabaseSchema>();
});

it("derives no tables from an empty record", () => {
  type Empty = DataModel.DataModel<{}>;
  expectTypeOf<DataModel.Tables<Empty>>().toBeNever();
  expectTypeOf<keyof DataModel.ToConvexDataModel<Empty>>().toBeNever();
});
