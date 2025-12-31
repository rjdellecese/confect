import { describe, expectTypeOf, test } from "vitest";
import type * as ConfectApiGroupImpl from "../server/ConfectApiGroupImpl";

describe("ConfectApiGroupImpl", () => {
  describe("ConfectApiGroupImpl", () => {
    test("is excludable", () => {
      type GroupAService = ConfectApiGroupImpl.ConfectApiGroupImpl<"groupA">;
      type GroupBService = ConfectApiGroupImpl.ConfectApiGroupImpl<"groupB">;

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

