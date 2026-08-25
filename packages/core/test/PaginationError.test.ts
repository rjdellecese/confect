import { PaginationError } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Option from "effect/Option";

describe("PaginationError", () => {
  it("recognizes Convex's structured invalid-cursor error", () => {
    const cause = new ConvexError({
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    });
    const error = Option.getOrThrow(PaginationError.fromUnknown(cause));

    expect(error).toBeInstanceOf(PaginationError.InvalidCursor);
    expect(error.cause).toBe(cause);
  });

  it("recognizes Convex's message-only fallback", () => {
    const cause = new Error("InvalidCursor: cursor has expired");
    const error = Option.getOrThrow(PaginationError.fromUnknown(cause));

    expect(error.cause).toBe(cause);
  });

  it("recognizes an already normalized error", () => {
    const error = new PaginationError.InvalidCursor({ cause: "expired" });

    expect(Option.getOrThrow(PaginationError.fromUnknown(error))).toBe(error);
  });

  it("rejects unrelated errors", () => {
    expect(
      Option.isNone(PaginationError.fromUnknown(new Error("offline"))),
    ).toBe(true);
  });
});
