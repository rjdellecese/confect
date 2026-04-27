import { FunctionSpec, PaginationResult, Ref } from "@confect/core";
import type * as ConvexReact from "convex/react";
import { Schema } from "effect";
import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof ConvexReact>();

  return {
    ...actual,
    usePaginatedQuery: vi.fn(() => ({
      results: ["1"],
      status: "Exhausted",
      isLoading: false,
      loadMore: vi.fn(),
    })),
  };
});

const { usePaginatedQuery: useConvexPaginatedQuery } =
  await import("convex/react");
const { usePaginatedQuery } = await import("../src/index");

describe(usePaginatedQuery, () => {
  beforeEach(() => {
    vi.mocked(useConvexPaginatedQuery).mockClear();
  });

  const spec = FunctionSpec.publicQuery({
    name: "list",
    args: Schema.Struct({
      tag: Schema.String,
      count: Schema.NumberFromString,
      paginationOpts: PaginationResult.PaginationOptions,
    }),
    returns: PaginationResult.PaginationResult(Schema.NumberFromString),
  });
  const ref = Ref.make("notes", spec);

  test("encodes non-pagination args and decodes page items", () => {
    const result = usePaginatedQuery(
      ref,
      { tag: "important", count: 5 },
      { initialNumItems: 10 },
    );

    expect(result.results).toStrictEqual([1]);
    expect(useConvexPaginatedQuery).toHaveBeenCalledWith(
      Ref.getFunctionReference(ref),
      { tag: "important", count: "5" },
      { initialNumItems: 10 },
    );
  });

  test("passes skip through without encoding", () => {
    usePaginatedQuery(ref, "skip", { initialNumItems: 10 });

    expect(useConvexPaginatedQuery).toHaveBeenLastCalledWith(
      Ref.getFunctionReference(ref),
      "skip",
      { initialNumItems: 10 },
    );
  });

  test("omits paginationOpts from hook args", () => {
    expectTypeOf<Parameters<typeof usePaginatedQuery<typeof ref>>[1]>()
      .exclude<"skip">()
      .toEqualTypeOf<{
        readonly tag: string;
        readonly count: number;
      }>();
  });

  test("returns decoded page item results", () => {
    expectTypeOf<
      ReturnType<typeof usePaginatedQuery<typeof ref>>["results"]
    >().toEqualTypeOf<number[]>();
  });
});
