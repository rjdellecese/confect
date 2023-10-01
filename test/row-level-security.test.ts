import { Option } from "effect/index";
import { describe, expect, test } from "vitest";

import { api } from "./convex/_generated/api";

describe("RowLevelSecurity", () => {
  describe("withQueryRLS", () => {
    describe("get", () => {
      test("get without rules constraints succeeds", async () => {
        const userId = await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertUserWithoutRulesConstraints
        );

        expect(
          await global.convexHttpClient.query(
            api.rowLevelSecurity.getUserWithoutRulesConstraints,
            { userId }
          )
        ).toStrictEqual(userId);
      });

      test("disallowed insertion throws an error", async () => {
        expect(
          async () =>
            await global.convexHttpClient.mutation(
              api.rowLevelSecurity.insertUserWithRulesConstraints
            )
        ).rejects.toThrowError(/InsertionNotAllowedError/);
      });
    });
  });

  describe("withMutationRLS", () => {
    describe("insert", () => {
      test("insert without rules constraints succeeds", async () => {
        expect(
          async () =>
            await global.convexHttpClient.mutation(
              api.rowLevelSecurity.insertUserWithoutRulesConstraints
            )
        ).not.toThrowError();
      });

      test("disallowed insertion throws an error", async () => {
        expect(
          async () =>
            await global.convexHttpClient.mutation(
              api.rowLevelSecurity.insertUserWithRulesConstraints
            )
        ).rejects.toThrowError(/InsertionNotAllowedError/);
      });
    });

    describe("patch", () => {
      test("patch without rules constraints succeeds", async () => {
        const patchedUser = await global.convexHttpClient.mutation(
          api.rowLevelSecurity.patchWithoutRulesConstraintsSucceeds
        );

        expect(Option.map(patchedUser, ({ name }) => name)).toStrictEqual(
          Option.some("Jane Doe")
        );
      });

      test("disallowed patch throws an error", async () => {
        expect(
          async () =>
            await global.convexHttpClient.mutation(
              api.rowLevelSecurity.disallowedPatchThrowsAnError
            )
        ).rejects.toThrowError(/ModificationNotAllowedError/);
      });
    });
  });
});
