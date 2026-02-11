import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Schema } from "effect";
import * as FunctionSpec from "../src/FunctionSpec";
import * as GroupSpec from "../src/GroupSpec";
import * as Ref from "../src/Ref";
import * as Refs from "../src/Refs";
import * as Spec from "../src/Spec";

describe("make", () => {
  it("turns a spec into refs", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.Array(Schema.String);

    const spec = Spec.make().add(
      GroupSpec.make("notes").addFunction(
        FunctionSpec.query({
          name: "list",
          args: FnArgs,
          returns: FnReturns,
        }),
      ),
    );
    const { all: refs } = Refs.make(spec);

    const actualRef = refs.notes.list;
    const expectedRef = Ref.make(
      "notes:list",
      FunctionSpec.query({
        name: "list",
        args: FnArgs,
        returns: FnReturns,
      }),
    );

    expect(Ref.getConvexFunctionName(actualRef)).toStrictEqual(
      Ref.getConvexFunctionName(expectedRef),
    );
    expect(Ref.getFunction(actualRef)).toStrictEqual(
      Ref.getFunction(expectedRef),
    );
    expectTypeOf(actualRef).toEqualTypeOf(expectedRef);
  });

  it("throws an error if a group and function have the same name", () => {
    const spec = Spec.make().add(
      GroupSpec.make("notes")
        .addGroup(GroupSpec.make("list"))
        .addFunction(
          FunctionSpec.query({
            name: "list",
            args: Schema.Struct({}),
            returns: Schema.Array(Schema.String),
          }),
        ),
    );
    expect(() => Refs.make(spec)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Group and function at same level have same name ('notes:list')]`,
    );
  });

  it("filters internal refs to only internal functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.make("notes")
        .addFunction(
          FunctionSpec.query({
            name: "publicList",
            args: FnArgs,
            returns: FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            args: FnArgs,
            returns: FnReturns,
          }),
        ),
    );
    const { internal: internalRefs } = Refs.make(spec);

    expectTypeOf(internalRefs.notes.internalList).toEqualTypeOf<
      Ref.Ref<"query", "internal", typeof FnArgs, typeof FnReturns>
    >();

    // @ts-expect-error - publicList should be filtered out
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    internalRefs.notes.publicList;
  });

  it("filters out groups with no matching functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make()
      .add(
        GroupSpec.make("publicOnly").addFunction(
          FunctionSpec.query({
            name: "list",
            args: FnArgs,
            returns: FnReturns,
          }),
        ),
      )
      .add(
        GroupSpec.make("internalOnly").addFunction(
          FunctionSpec.internalQuery({
            name: "list",
            args: FnArgs,
            returns: FnReturns,
          }),
        ),
      );

    const { internal: internalRefs } = Refs.make(spec);

    expectTypeOf(internalRefs.internalOnly.list).toEqualTypeOf<
      Ref.Ref<"query", "internal", typeof FnArgs, typeof FnReturns>
    >();

    // @ts-expect-error - publicOnly group should be filtered out entirely
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    internalRefs.publicOnly;
  });

  it("filters public refs to only public functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.make("notes")
        .addFunction(
          FunctionSpec.query({
            name: "publicList",
            args: FnArgs,
            returns: FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            args: FnArgs,
            returns: FnReturns,
          }),
        ),
    );
    const { public: publicRefs } = Refs.make(spec);

    expectTypeOf(publicRefs.notes.publicList).toEqualTypeOf<
      Ref.Ref<"query", "public", typeof FnArgs, typeof FnReturns>
    >();

    // @ts-expect-error - internalList should be filtered out
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    publicRefs.notes.internalList;
  });

  it("supports nested groups and dot notation for noPropertyAccessFromIndexSignature", () => {
    const spec = Spec.make()
      .add(
        GroupSpec.make("groups")
          .addGroup(
            GroupSpec.make("notes").addFunction(
              FunctionSpec.query({
                name: "list",
                args: Schema.Struct({}),
                returns: Schema.Array(Schema.String),
              }),
            ),
          )
          .addGroup(
            GroupSpec.make("random").addFunction(
              FunctionSpec.action({
                name: "getNumber",
                args: Schema.Struct({}),
                returns: Schema.Number,
              }),
            ),
          ),
      )
      .add(
        GroupSpec.make("databaseReader").addFunction(
          FunctionSpec.query({
            name: "getNote",
            args: Schema.Struct({}),
            returns: Schema.String,
          }),
        ),
      );

    const { public: api } = Refs.make(spec);

    // This must work with dot notation (noPropertyAccessFromIndexSignature)
    void api.databaseReader;
    void api.databaseReader.getNote;
    void api.groups.notes.list;
  });
});
