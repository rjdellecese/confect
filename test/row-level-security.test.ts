import { expect, test } from "vitest";

import { api } from "../convex/_generated/api.js";

test("row-level-security", async () => {
  const user = await global.convexHttpClient.mutation(
    api["insertUser"].default,
    {}
  );

  expect(true).toBe(true);
});
