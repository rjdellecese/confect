import { describe, expectTypeOf, test } from "vitest";
import * as ConfectApiGroupSpec from "../api/ConfectApiGroupSpec";

describe("ConfectApiGroupSpec.Path.All", () => {
  test("produces the correct group paths", () => {
    const _GroupA = ConfectApiGroupSpec.make("groupA");
    const _GroupB = ConfectApiGroupSpec.make("groupB")
      .addGroup(ConfectApiGroupSpec.make("groupBC"))
      .addGroup(
        ConfectApiGroupSpec.make("groupBD").addGroup(
          ConfectApiGroupSpec.make("groupBDE"),
        ),
      );

    type AllPaths = ConfectApiGroupSpec.Path.All<typeof _GroupA | typeof _GroupB>;

    expectTypeOf<AllPaths>().toEqualTypeOf<
      | "groupA"
      | "groupB"
      | "groupB.groupBC"
      | "groupB.groupBD"
      | "groupB.groupBD.groupBDE"
    >();

    expectTypeOf<AllPaths>().not.toExtend<"groupA.groupBC">();
    expectTypeOf<AllPaths>().not.toExtend<"groupA.groupBD">();
    expectTypeOf<AllPaths>().not.toExtend<"groupA.groupBD.groupBDE">();
    expectTypeOf<AllPaths>().not.toExtend<"groupB.groupA">();
  });
});

