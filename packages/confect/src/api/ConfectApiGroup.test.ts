import { describe, expectTypeOf, test } from "vitest";
import * as ConfectApiGroup from "./ConfectApiGroup";

describe("ConfectApiGroup.Path.All", () => {
  test("produces the correct group paths", () => {
    const _GroupA = ConfectApiGroup.make("groupA");
    const _GroupB = ConfectApiGroup.make("groupB")
      .addGroup(ConfectApiGroup.make("groupBC"))
      .addGroup(
        ConfectApiGroup.make("groupBD").addGroup(
          ConfectApiGroup.make("groupBDE"),
        ),
      );

    type AllPaths = ConfectApiGroup.Path.All<typeof _GroupA | typeof _GroupB>;

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
