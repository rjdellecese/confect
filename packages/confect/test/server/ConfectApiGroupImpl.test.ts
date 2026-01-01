import { describe, expectTypeOf, test } from "vitest";
import type * as ConfectApiGroupImpl from "../../src/server/GroupImpl";

describe("ConfectApiGroupImpl", () => {
  describe("ConfectApiGroupImpl", () => {
    test("is excludable", () => {
      type GroupAService = ConfectApiGroupImpl.GroupImpl<"groupA">;
      type GroupBService = ConfectApiGroupImpl.GroupImpl<"groupB">;

      type ExcludedGroupAService = Exclude<
        GroupAService | GroupBService,
        GroupAService
      >;
      type ExcludedGroupBService = Exclude<
        GroupAService | GroupBService,
        GroupBService
      >;

      expectTypeOf<ExcludedGroupAService>().toEqualTypeOf<GroupBService>();
      expectTypeOf<ExcludedGroupBService>().toEqualTypeOf<GroupAService>();
    });
  });
});
