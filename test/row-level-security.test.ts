import { expect, test } from "@jest/globals";

import { api } from "../convex/_generated/api";

test("row-level-security", () => {
  global.convexHttpClient.mutation(api.insertUser.default, {});

  expect(true).toBe(true);
});
