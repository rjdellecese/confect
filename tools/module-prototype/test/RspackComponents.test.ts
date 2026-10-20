import { describe, expect, it } from "@effect/vitest";
import { isDefinition } from "../src/RspackComponents.ts";

describe("RspackComponents", () => {
  it.each([
    "convex.config.ts",
    "./nested/convex.config",
    "component/convex.config",
    "@convex-dev/workpool/convex.config.js",
  ])("recognizes production's component import pattern for %s", (file) => {
    expect(isDefinition(file)).toBe(true);
  });

  it.each(["convex/server", "./component.ts", "./config.ts"])(
    "does not reserve unrelated modules such as %s",
    (file) => expect(isDefinition(file)).toBe(false),
  );
});
