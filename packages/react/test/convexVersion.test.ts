import { FunctionSpec, Ref } from "@confect/core";
import { renderHook } from "@testing-library/react";
import * as Schema from "effect/Schema";
import { expect, test } from "@effect/vitest";
import { vi } from "vitest";
import { usePaginatedQuery } from "@confect/react";

// Convex 1.32–1.35 export `usePaginatedQueryInternal` with only three
// parameters, silently ignoring the `throwOnError` argument and always
// throwing. The arity is indistinguishable from 1.36's (whose fourth
// parameter is defaulted), so the hook gates on the package version instead —
// which is what this file pins.
vi.mock("convex", () => ({ version: "1.35.0" }));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
  usePaginatedQuery: vi.fn(),
  usePaginatedQueryInternal: () => ({
    user: {
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: vi.fn(),
    },
  }),
}));

const paginatedQuery = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "listPaginated",
    item: () => Schema.Struct({ value: Schema.Finite }),
  }),
);

test("usePaginatedQuery refuses to run on a convex version that always throws", () => {
  expect(() =>
    renderHook(() =>
      usePaginatedQuery(paginatedQuery, {}, { initialNumItems: 10 }),
    ),
  ).toThrow(/requires convex >= 1\.36\.0, but found 1\.35\.0/);
});
