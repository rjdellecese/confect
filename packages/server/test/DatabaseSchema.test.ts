import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as Table from "@confect/server/Table";
import * as IdScope from "@confect/core/IdScope";
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
    expectTypeOf<DatabaseSchema.SystemTableNames>().toEqualTypeOf<
      "_storage" | "_scheduled_functions"
    >();
    expectTypeOf<DatabaseSchema.TableNames<typeof schema>>().toEqualTypeOf<
      "notes" | "users"
    >();
    expectTypeOf<DatabaseSchema.AllTableNames<typeof schema>>().toEqualTypeOf<
      "notes" | "users" | "_storage" | "_scheduled_functions"
    >();
    expectTypeOf<
      DatabaseSchema.TableWithName<typeof schema, "notes">
    >().toEqualTypeOf<typeof notes>();
    expectTypeOf<"~Tables">().not.toExtend<keyof typeof schema>();
  });

  it("represents an empty schema with no table members", () => {
    const schema = DatabaseSchema.make({});
    expect(DatabaseSchema.tables(schema)).toEqual({});
    expect(schema.target).toBe(DatabaseSchema.appTarget);
    expectTypeOf(schema.target).toEqualTypeOf<DatabaseSchema.AppTarget>();
    // @ts-expect-error An omitted target constructs an application schema.
    const misidentified: DatabaseSchema.DatabaseSchema<
      {},
      DatabaseSchema.ComponentTarget
    > = DatabaseSchema.make({});
    void misidentified;
    expectTypeOf<DatabaseSchema.Tables<typeof schema>>().toBeNever();
    expectTypeOf<DatabaseSchema.TableNames<typeof schema>>().toBeNever();
    expectTypeOf<DatabaseSchema.AllTableNames<typeof schema>>().toEqualTypeOf<
      "_storage" | "_scheduled_functions"
    >();
  });

  it("retains component scope alongside the precise lazy table record", () => {
    const scope = IdScope.component("counter");
    const target = { kind: "component", scope } as const;
    let evaluated = 0;
    const counters = Table.make(() => {
      evaluated++;
      return Schema.Struct({ count: Schema.Finite });
    })("counters", scope);
    const input = { counters };
    expect(DatabaseSchema.checkedTarget(target)).toBe(target);
    expectTypeOf(DatabaseSchema.checkedTarget(target)).toEqualTypeOf<
      typeof target
    >();
    const schema = DatabaseSchema.make(input, target);

    expect(DatabaseSchema.tables(schema)).toBe(input);
    expect(schema.target).toBe(target);
    expect(evaluated).toBe(0);
    expectTypeOf(DatabaseSchema.tables(schema).counters).toEqualTypeOf<
      typeof counters
    >();
    expectTypeOf<DatabaseSchema.Scope<typeof schema>>().toEqualTypeOf<
      typeof scope
    >();
    expectTypeOf<DatabaseSchema.Tables<typeof schema>>().toEqualTypeOf<
      typeof counters
    >();
    expectTypeOf<"~Tables">().not.toExtend<keyof typeof schema>();
  });

  it("rejects mismatched target kinds and ID scopes with or without tables", () => {
    const component = { kind: "component", scope: IdScope.app } as const;
    const app = { kind: "app", scope: IdScope.component("counter") } as const;
    const error = (target: typeof component | typeof app) =>
      expect.objectContaining({
        _tag: "InvalidDatabaseTargetError",
        ...target,
      });
    expect(() => DatabaseSchema.checkedTarget(component)).toThrow(
      error(component),
    );
    expect(() => DatabaseSchema.make({}, component)).toThrow(error(component));
    // @ts-expect-error Application targets cannot carry a component scope.
    expect(() => DatabaseSchema.checkedTarget(app)).toThrow(error(app));
    // @ts-expect-error Validate malformed application targets from untyped callers, too.
    expect(() => DatabaseSchema.make({}, app)).toThrow(error(app));
  });

  it("reports a table bound to the wrong name or scope", () => {
    const scope = IdScope.component("counter");
    const notes = Table.make(() => Schema.Struct({ text: Schema.String }))(
      "notes",
      scope,
    );
    expect(() => DatabaseSchema.make({ notes })).toThrow(
      expect.objectContaining({
        _tag: "InvalidTableBindingError",
        recordKey: "notes",
        tableName: "notes",
        tableScope: scope,
        targetScope: IdScope.app,
      }),
    );
    expect(() =>
      DatabaseSchema.make({ other: notes }, { kind: "component", scope }),
    ).toThrow(
      expect.objectContaining({
        _tag: "InvalidTableBindingError",
        recordKey: "other",
        tableName: "notes",
        tableScope: scope,
        targetScope: scope,
      }),
    );
  });
});
