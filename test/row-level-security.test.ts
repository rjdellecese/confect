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

    describe("paginate", () => {
      test("paginate without rules constraints succeeds", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        const usersCount = await global.convexHttpClient
          .query(api.rowLevelSecurity.paginateUsersWithoutRuleConstraints)
          .then((paginationResult) => paginationResult.page.length);

        expect(usersCount).toStrictEqual(2);
      });

      test("paginate including disallowed row throws an error", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        expect(
          async () =>
            await global.convexHttpClient.query(
              api.rowLevelSecurity.paginateUsersWithRuleConstraints
            )
        ).rejects.toThrowError(/ReadNotAllowedError/);
      });
    });

    describe("collect", () => {
      test("collect without rules constraints succeeds", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        const usersCount = await global.convexHttpClient
          .query(api.rowLevelSecurity.collectUsersWithoutRuleConstraints)
          .then((users) => users.length);

        expect(usersCount).toStrictEqual(2);
      });

      test("collect including disallowed row throws an error", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        expect(
          async () =>
            await global.convexHttpClient.query(
              api.rowLevelSecurity.collectUsersWithRuleConstraints
            )
        ).rejects.toThrowError(/ReadNotAllowedError/);
      });
    });

    describe("take", () => {
      test("take without rules constraints succeeds", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        const usersCount = await global.convexHttpClient
          .query(api.rowLevelSecurity.takeUsersWithoutRuleConstraints)
          .then((users) => users.length);

        expect(usersCount).toStrictEqual(2);
      });

      test("take including disallowed row throws an error", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        expect(
          async () =>
            await global.convexHttpClient.query(
              api.rowLevelSecurity.takeUsersWithRuleConstraints
            )
        ).rejects.toThrowError(/ReadNotAllowedError/);
      });
    });

    describe("first", () => {
      test("first without rules constraints succeeds", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        expect(
          await global.convexHttpClient
            .query(api.rowLevelSecurity.firstUsersWithoutRuleConstraints)
            .then((optionUser) => {
              console.log(optionUser);
              return Option.isSome(optionUser);
            })
        ).toStrictEqual(true);
      });

      test("first including disallowed row throws an error", async () => {
        await global.convexHttpClient.mutation(
          api.rowLevelSecurity.insertTwoUsersWithoutRulesConstraints
        );

        expect(
          async () =>
            await global.convexHttpClient.query(
              api.rowLevelSecurity.firstUsersWithRuleConstraints
            )
        ).rejects.toThrowError(/ReadNotAllowedError/);
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
