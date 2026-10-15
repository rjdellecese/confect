import { FunctionSpec, GroupSpec, Spec } from "@confect/core";
import { describe, expect, test } from "@effect/vitest";
import * as Equal from "effect/Equal";
import * as HashSet from "effect/HashSet";
import * as Schema from "effect/Schema";

import * as FunctionPath from "@confect/cli/FunctionPath";
import * as FunctionPaths from "@confect/cli/FunctionPaths";
import * as GroupPath from "@confect/cli/GroupPath";

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
    const spec = Spec.fromGroups({});

    const result = FunctionPaths.make(spec);

    expect(Equal.equals(result, HashSet.empty())).toBe(true);
  });

  test("spec with one group with no functions", () => {
    const spec = Spec.fromGroups({ myGroup: GroupSpec.make() });

    const result = FunctionPaths.make(spec);

    expect(Equal.equals(result, HashSet.empty())).toBe(true);
  });

  test("spec with one group with one function", () => {
    const spec = Spec.fromGroups({
      myGroup: GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "myQuery",
          returns: () => Schema.Null,
        }),
      ),
    });

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(makeFunctionPath(["myGroup"], "myQuery")),
      ),
    ).toBe(true);
  });

  test("spec with one group with multiple functions", () => {
    const spec = Spec.fromGroups({
      myGroup: GroupSpec.make()
        .addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            returns: () => Schema.Array(Schema.String),
          }),
        )
        .addFunction(
          FunctionSpec.publicMutation({
            name: "insert",
            args: () => ({ text: Schema.String }),
            returns: () => Schema.String,
          }),
        )
        .addFunction(
          FunctionSpec.publicAction({
            name: "doSomething",
            returns: () => Schema.Void,
          }),
        ),
    });

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
    const spec = Spec.fromGroups({
      users: GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "getById",
          args: () => ({ id: Schema.String }),
          returns: () => Schema.Unknown,
        }),
      ),
      posts: GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          returns: () => Schema.Array(Schema.Unknown),
        }),
      ),
    });

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
    const innerGroup = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "innerQuery",
        returns: () => Schema.Null,
      }),
    );

    const outerGroup = GroupSpec.addGroupsAt(GroupSpec.make(), {
      inner: innerGroup,
    }).addFunction(
      FunctionSpec.publicMutation({
        name: "outerMutation",
        returns: () => Schema.Null,
      }),
    );

    const spec = Spec.fromGroups({ outer: outerGroup });

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
    const level3 = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "deepQuery",
        returns: () => Schema.Finite,
      }),
    );

    const level2 = GroupSpec.addGroupsAt(GroupSpec.make(), { level3 });

    const level1 = GroupSpec.addGroupsAt(GroupSpec.make(), { level2 });

    const spec = Spec.fromGroups({ level1 });

    const result = FunctionPaths.make(spec);

    expect(
      Equal.equals(
        result,
        HashSet.make(
          makeFunctionPath(["level1", "level2", "level3"], "deepQuery"),
        ),
      ),
    ).toBe(true);
  });

  test("spec with multiple nested groups at same level", () => {
    const notes = GroupSpec.make()
      .addFunction(
        FunctionSpec.publicMutation({
          name: "insert",
          args: () => ({ text: Schema.String }),
          returns: () => Schema.String,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          returns: () => Schema.Array(Schema.String),
        }),
      );

    const random = GroupSpec.make().addFunction(
      FunctionSpec.publicAction({
        name: "getNumber",
        returns: () => Schema.Finite,
      }),
    );

    const notesAndRandom = GroupSpec.addGroupsAt(GroupSpec.make(), {
      notes,
      random,
    });

    const spec = Spec.fromGroups({ notesAndRandom });

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
    const spec = Spec.fromGroups({
      api: GroupSpec.make()
        .addFunction(
          FunctionSpec.publicQuery({
            name: "publicQuery",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalQuery",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.publicMutation({
            name: "publicMutation",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalMutation({
            name: "internalMutation",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.publicAction({
            name: "publicAction",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.internalAction({
            name: "internalAction",
            returns: () => Schema.Null,
          }),
        ),
    });

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
