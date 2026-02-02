import { FunctionSpec, GroupSpec, Spec } from "@confect/core";
import { describe, expect, test } from "@effect/vitest";
import { Equal, HashSet, Schema } from "effect";

import * as FunctionPath from "../src/FunctionPath";
import * as FunctionPaths from "../src/FunctionPaths";
import * as GroupPath from "../src/GroupPath";

/**
 * Helper to create a FunctionPath from group path segments and function name.
 */
const makeFunctionPath = (
  groupSegments: readonly [string, ...string[]],
  name: string,
): FunctionPath.FunctionPath =>
  FunctionPath.FunctionPath.make({
    groupPath: GroupPath.make(groupSegments),
    name,
  });

describe("FunctionPaths.make", () => {
  test("empty spec", () => {
    const spec = Spec.make();

    const result = FunctionPaths.make(spec);

    expect(Equal.equals(result, HashSet.empty())).toBe(true);
  });

  test("spec with one group with no functions", () => {
    const spec = Spec.make().add(GroupSpec.make("myGroup"));

    const result = FunctionPaths.make(spec);

    expect(Equal.equals(result, HashSet.empty())).toBe(true);
  });

  test("spec with one group with one function", () => {
    const spec = Spec.make().add(
      GroupSpec.make("myGroup").addFunction(
        FunctionSpec.query({
          name: "myQuery",
          args: Schema.Struct({}),
          returns: Schema.Null,
        }),
      ),
    );

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(result, HashSet.make(makeFunctionPath(["myGroup"], "myQuery"))),
    ).toBe(true);
  });

  test("spec with one group with multiple functions", () => {
    const spec = Spec.make().add(
      GroupSpec.make("myGroup")
        .addFunction(
          FunctionSpec.query({
            name: "list",
            args: Schema.Struct({}),
            returns: Schema.Array(Schema.String),
          }),
        )
        .addFunction(
          FunctionSpec.mutation({
            name: "insert",
            args: Schema.Struct({ text: Schema.String }),
            returns: Schema.String,
          }),
        )
        .addFunction(
          FunctionSpec.action({
            name: "doSomething",
            args: Schema.Struct({}),
            returns: Schema.Void,
          }),
        ),
    );

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["myGroup"], "list"),
          makeFunctionPath(["myGroup"], "insert"),
          makeFunctionPath(["myGroup"], "doSomething"),
        ),
      ),
    ).toBe(true);
  });

  test("spec with multiple top-level groups", () => {
    const spec = Spec.make()
      .add(
        GroupSpec.make("users").addFunction(
          FunctionSpec.query({
            name: "getById",
            args: Schema.Struct({ id: Schema.String }),
            returns: Schema.Unknown,
          }),
        ),
      )
      .add(
        GroupSpec.make("posts").addFunction(
          FunctionSpec.query({
            name: "list",
            args: Schema.Struct({}),
            returns: Schema.Array(Schema.Unknown),
          }),
        ),
      );

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["users"], "getById"),
          makeFunctionPath(["posts"], "list"),
        ),
      ),
    ).toBe(true);
  });

  test("spec with nested groups", () => {
    const innerGroup = GroupSpec.make("inner").addFunction(
      FunctionSpec.query({
        name: "innerQuery",
        args: Schema.Struct({}),
        returns: Schema.Null,
      }),
    );

    const outerGroup = GroupSpec.make("outer")
      .addGroup(innerGroup)
      .addFunction(
        FunctionSpec.mutation({
          name: "outerMutation",
          args: Schema.Struct({}),
          returns: Schema.Null,
        }),
      );

    const spec = Spec.make().add(outerGroup);

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["outer"], "outerMutation"),
          makeFunctionPath(["outer", "inner"], "innerQuery"),
        ),
      ),
    ).toBe(true);
  });

  test("spec with deeply nested groups", () => {
    const level3 = GroupSpec.make("level3").addFunction(
      FunctionSpec.query({
        name: "deepQuery",
        args: Schema.Struct({}),
        returns: Schema.Number,
      }),
    );

    const level2 = GroupSpec.make("level2").addGroup(level3);

    const level1 = GroupSpec.make("level1").addGroup(level2);

    const spec = Spec.make().add(level1);

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(makeFunctionPath(["level1", "level2", "level3"], "deepQuery")),
      ),
    ).toBe(true);
  });

  test("spec with multiple nested groups at same level", () => {
    const notes = GroupSpec.make("notes")
      .addFunction(
        FunctionSpec.mutation({
          name: "insert",
          args: Schema.Struct({ text: Schema.String }),
          returns: Schema.String,
        }),
      )
      .addFunction(
        FunctionSpec.query({
          name: "list",
          args: Schema.Struct({}),
          returns: Schema.Array(Schema.String),
        }),
      );

    const random = GroupSpec.make("random").addFunction(
      FunctionSpec.action({
        name: "getNumber",
        args: Schema.Struct({}),
        returns: Schema.Number,
      }),
    );

    const notesAndRandom = GroupSpec.make("notesAndRandom")
      .addGroup(notes)
      .addGroup(random);

    const spec = Spec.make().add(notesAndRandom);

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["notesAndRandom", "notes"], "insert"),
          makeFunctionPath(["notesAndRandom", "notes"], "list"),
          makeFunctionPath(["notesAndRandom", "random"], "getNumber"),
        ),
      ),
    ).toBe(true);
  });

  test("includes all function types (query, mutation, action)", () => {
    const spec = Spec.make().add(
      GroupSpec.make("api")
        .addFunction(
          FunctionSpec.query({
            name: "publicQuery",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalQuery",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.mutation({
            name: "publicMutation",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalMutation({
            name: "internalMutation",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.action({
            name: "publicAction",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalAction({
            name: "internalAction",
            args: Schema.Struct({}),
            returns: Schema.Null,
          }),
        ),
    );

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["api"], "publicQuery"),
          makeFunctionPath(["api"], "internalQuery"),
          makeFunctionPath(["api"], "publicMutation"),
          makeFunctionPath(["api"], "internalMutation"),
          makeFunctionPath(["api"], "publicAction"),
          makeFunctionPath(["api"], "internalAction"),
        ),
      ),
    ).toBe(true);
  });
});
