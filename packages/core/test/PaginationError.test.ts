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
    const error = Option.getOrThrow(
      PaginationError.fromConvexQueryError(cause),
    );

    expect(error).toBeInstanceOf(PaginationError.InvalidCursor);
    expect(error.cause).toBe(cause);
  });

  it("recognizes Convex's message-only fallback", () => {
    const cause = new Error("InvalidCursor: cursor has expired");
    const error = Option.getOrThrow(
      PaginationError.fromConvexQueryError(cause),
    );

    expect(error.cause).toBe(cause);
  });

  it("recognizes Convex's structured invalid-cursor error data", () => {
    const cause = {
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    } as const;
    const error = Option.getOrThrow(
      PaginationError.fromConvexErrorData(cause),
    );

    expect(error.cause).toBe(cause);
  });

  it("rejects unrelated errors", () => {
    expect(
      Option.isNone(
        PaginationError.fromConvexQueryError(new Error("offline")),
      ),
    ).toBe(true);
    expect(
      Option.isNone(
        PaginationError.fromConvexQueryError(
          new ConvexError({ _tag: "NotFound" }),
        ),
      ),
    ).toBe(true);
    expect(
      Option.isNone(PaginationError.fromConvexQueryError("InvalidCursor")),
    ).toBe(true);
    expect(
      Option.isNone(
        PaginationError.fromConvexErrorData({
          isConvexSystemError: true,
          paginationError: "InvalidPage",
        }),
      ),
    ).toBe(true);
    expect(
      Option.isNone(
        PaginationError.fromConvexErrorData(
          new Error("InvalidCursor: not server error data"),
        ),
      ),
    ).toBe(true);
  });
});
