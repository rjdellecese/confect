import { describe, expectTypeOf, test } from "vitest";
import { GenericConfectSchema } from "../server/schema";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiGroup from "./ConfectApiGroup";

describe("ConfectApiBuilder", () => {
  describe("ConfectApiGroupService", () => {
    test("is excludable", () => {
      type ConfectSchema = GenericConfectSchema;

      type GroupA = ConfectApiGroup.ConfectApiGroup<ConfectSchema, "groupA">;
      type GroupB = ConfectApiGroup.ConfectApiGroup<ConfectSchema, "groupB">;

      type GroupAService = ConfectApiBuilder.ConfectApiGroupService<
        ConfectSchema,
        "api",
        GroupA
      >;
      type GroupBService = ConfectApiBuilder.ConfectApiGroupService<
        ConfectSchema,
        "api",
        GroupB
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
