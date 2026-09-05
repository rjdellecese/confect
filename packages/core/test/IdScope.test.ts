import { describe, expect, it } from "@effect/vitest";
import { GenericId, IdScope, SchemaToValidator, Table } from "@confect/core";
import type { GenericId as ConvexId } from "convex/values";
import { v } from "convex/values";
import * as Schema from "effect/Schema";

const definition = IdScope.component("@example/counter");
const first = IdScope.instance(IdScope.app, "first");
const second = IdScope.instance(IdScope.app, "second");

describe("ID scopes", () => {
  it("keeps the wire string while distinguishing tables and component instances", () => {
    const own = GenericId.GenericId("users", definition);
    const bound = GenericId.rebase(own, definition, first);
    const value = Schema.decodeUnknownSync(bound)("user-id");
    expect(value).toBe("user-id");
    expect(Schema.encodeSync(bound)(value)).toBe("user-id");

    const firstId: GenericId.GenericId<"users", typeof first> = value;
    void firstId;
    // @ts-expect-error A component ID is not an application's Convex ID.
    const appId: ConvexId<"users"> = value;
    // @ts-expect-error Installing the same definition twice creates distinct IDs.
    const secondId: GenericId.GenericId<"users", typeof second> = value;
    // @ts-expect-error Table names remain significant within a scope.
    const otherTable: GenericId.GenericId<"notes", typeof first> = value;
    void [appId, secondId, otherTable];
  });

  it("compiles local IDs as table validators and foreign IDs as strings", () => {
    const own = GenericId.GenericId("users", definition);
    const bound = GenericId.rebase(own, definition, first);
    expect(SchemaToValidator.compileReturnsSchema(own, definition)).toEqual(
      v.id("users"),
    );
    expect(SchemaToValidator.compileReturnsSchema(bound)).toEqual(v.string());
    expect(
      SchemaToValidator.compileReturnsSchema(
        GenericId.GenericId("users"),
        definition,
      ),
    ).toEqual(v.string());
  });

  it("rebinds nested and optional IDs without changing transformations or foreign IDs", () => {
    const input = Schema.Struct({
      id: GenericId.GenericId("users", definition),
      related: Schema.Array(GenericId.GenericId("users", definition)),
      owner: GenericId.GenericId("users"),
      optional: Schema.optionalKey(GenericId.GenericId("users", definition)),
      count: Schema.FiniteFromString,
    }).pipe(Schema.encodeKeys({ id: "user_id" }));
    const bound = GenericId.rebase(input, definition, first);
    const wire = {
      user_id: "one",
      related: ["two"],
      owner: "app-user",
      count: "3",
    };
    const decoded = Schema.decodeUnknownSync(bound)(wire);
    expect(decoded).toEqual({
      id: "one",
      related: ["two"],
      owner: "app-user",
      count: 3,
    });
    expect(Schema.encodeSync(bound)(decoded)).toEqual(wire);
    const appOwner: ConvexId<"users"> = decoded.owner;
    const related: GenericId.GenericId<"users", typeof first> =
      decoded.related[0]!;
    void [appOwner, related];
    expect(SchemaToValidator.compileArgsSchema(bound).owner).toEqual(
      v.id("users"),
    );
    expect(SchemaToValidator.compileArgsSchema(bound).user_id).toEqual(
      v.string(),
    );
  });

  it("scopes generated document IDs as well as authored fields", () => {
    const users = Table.make(() => Schema.Struct({ name: Schema.String }))(
      "users",
      definition,
    );
    const doc = Schema.decodeUnknownSync(users.Doc)({
      _id: "one",
      _creationTime: 0,
      name: "Ada",
    });
    const id: GenericId.GenericId<"users", typeof definition> = doc._id;
    void id;
    // @ts-expect-error Component document IDs cannot address a host table.
    const appId: ConvexId<"users"> = doc._id;
    void appId;
  });
});
