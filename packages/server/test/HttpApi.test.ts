import { describe, expect, test } from "vitest";

import * as HttpApi from "../src/HttpApi";

describe("HttpApi", () => {
  test("applies Convex runtime patches idempotently", () => {
    expect(() => {
      HttpApi.make({});
      HttpApi.make({});
    }).not.toThrow();
  });
});
