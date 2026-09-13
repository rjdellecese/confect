import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as Table from "@confect/server/Table";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

describe("DatabaseSchema", () => {
  it("stores the precise table record without evaluating table schemas", () => {
    let evaluated = 0;
    const notes = Table.make(() => {
      evaluated++;
      return Schema.Struct({ text: Schema.String });
    })("notes");
    const users = Table.make(() => {
      evaluated++;
      return Schema.Struct({ name: Schema.String });
    })("users");
    const input = { notes, users };
    const schema = DatabaseSchema.make(input);
    expect(DatabaseSchema.isDatabaseSchema(schema)).toBe(true);
    expect(DatabaseSchema.tables(schema)).toBe(input);
    expect(evaluated).toBe(0);
    expectTypeOf(DatabaseSchema.tables(schema).notes).toEqualTypeOf<
      typeof notes
    >();
    expectTypeOf<DatabaseSchema.Tables<typeof schema>>().toEqualTypeOf<
      typeof notes | typeof users
    >();
    expectTypeOf<DatabaseSchema.TableNames<typeof schema>>().toEqualTypeOf<
      "notes" | "users"
    >();
    expectTypeOf<
      DatabaseSchema.TableWithName<typeof schema, "notes">
    >().toEqualTypeOf<typeof notes>();
    expectTypeOf<"~Tables">().not.toExtend<keyof typeof schema>();
  });

  it("represents an empty schema with no table members", () => {
    const schema = DatabaseSchema.make({});
    expect(DatabaseSchema.tables(schema)).toEqual({});
    expectTypeOf<DatabaseSchema.Tables<typeof schema>>().toBeNever();
    expectTypeOf<DatabaseSchema.TableNames<typeof schema>>().toBeNever();
  });
});
