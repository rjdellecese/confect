import { expect, it } from "@effect/vitest";
import { resourceName } from "../src/internal/ResourceIdentity";

it("keeps replacement instances and resource kinds distinct", () => {
  const first = "0123456789abcdef0123456789abcde0";
  const replacement = "0123456789abcdef0123456789abcde1";
  expect(resourceName("deployment", first)).not.toBe(
    resourceName("deployment", replacement),
  );
  expect(
    new Set([
      resourceName("project", first),
      resourceName("deployment", first),
      resourceName("key", first),
    ]).size,
  ).toBe(3);
});

it("produces a valid deployment reference even for a numeric instance ID", () => {
  const reference = resourceName(
    "deployment",
    "01234567890123456789012345678901",
  );
  expect(reference).toMatch(/^[a-z0-9/-]{3,100}$/);
  expect(reference).not.toMatch(/^[a-z]+-[a-z]+-\d+$/);
});
