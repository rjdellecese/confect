import { describe, expectTypeOf, test } from "vitest";
import type * as ConfectApiBuilder from "./ConfectApiBuilder";

describe("ConfectApiBuilder", () => {
  describe("ConfectApiGroupService", () => {
    test("is excludable", () => {
      type GroupAService = ConfectApiBuilder.ConfectApiGroupService<
        "api",
        "groupA"
      >;
      type GroupBService = ConfectApiBuilder.ConfectApiGroupService<
        "api",
        "groupB"
      >;

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
