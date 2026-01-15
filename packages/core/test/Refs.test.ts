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
    const refs = Refs.make(spec);

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
    expect(() => Refs.make(spec)).toThrowErrorMatchingInlineSnapshot(`[Error: Group and function at same level have same name ('notes:list')]`);
  });
});

describe("justInternal", () => {
  it("filters refs to only internal functions", () => {
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
    const refs = Refs.make(spec);
    const internalRefs = Refs.justInternal(refs);

    expectTypeOf(internalRefs.notes.internalList).toEqualTypeOf<
      Ref.Ref<"query", "internal", typeof FnArgs, typeof FnReturns>
    >();

    // @ts-expect-error - publicList should be filtered out
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    internalRefs.notes.publicList;
  });
});

describe("justPublic", () => {
  it("filters refs to only public functions", () => {
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
    const refs = Refs.make(spec);
    const publicRefs = Refs.justPublic(refs);

    expectTypeOf(publicRefs.notes.publicList).toEqualTypeOf<
      Ref.Ref<"query", "public", typeof FnArgs, typeof FnReturns>
    >();

    // @ts-expect-error - internalList should be filtered out
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    publicRefs.notes.internalList;
  });
});
