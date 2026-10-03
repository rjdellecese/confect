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
  type FromSchema = DataModel.FromSchema<typeof schema>;
  type FromTables = DataModel.FromTables<typeof notes | typeof users>;
  expectTypeOf<DataModel.Tables<FromSchema>>().toEqualTypeOf<
    typeof notes | typeof users
  >();
  expectTypeOf<DataModel.Tables<FromTables>>().toEqualTypeOf<
    DataModel.Tables<FromSchema>
  >();
  expectTypeOf<keyof DataModel.ToConvex<FromSchema>>().toEqualTypeOf<
    "notes" | "users"
  >();
  expectTypeOf<DataModel.ToConvex<FromSchema>>().toEqualTypeOf<
    DataModel.ToConvex<FromTables>
  >();
  expectTypeOf<
    DataModel.DocumentWithName<FromSchema, "notes">["text"]
  >().toEqualTypeOf<string>();
  expectTypeOf<"~Tables">().not.toExtend<keyof FromSchema>();
});

it("derives no tables from an empty record", () => {
  type Empty = DataModel.DataModel<{}>;
  expectTypeOf<DataModel.Tables<Empty>>().toBeNever();
  expectTypeOf<keyof DataModel.ToConvex<Empty>>().toBeNever();
});
