import {
  FunctionSpec,
  PaginationOptions,
  PaginationResult,
  Ref,
} from "@confect/core";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import {
  assert,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";
import type { InvokeReturn, UsePaginatedQueryArgs } from "@confect/react";
import {
  QueryResult,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "@confect/react";

const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();
const useConvexActionMock = vi.fn();
const useConvexPaginatedQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useMutation: (...args: unknown[]) => useConvexMutationMock(...args),
  useAction: (...args: unknown[]) => useConvexActionMock(...args),
  usePaginatedQuery: (...args: unknown[]) =>
    useConvexPaginatedQueryMock(...args),
}));

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
    error: () => NotFound,
  }),
);

const queryNoError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: () => Schema.Struct({}),
    returns: () => Schema.Array(Schema.Struct({ text: Schema.String })),
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const mutationNoError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => Schema.Struct({ text: Schema.String }),
    returns: () => Schema.String,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const actionNoError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "ping",
    args: () => Schema.Struct({}),
    returns: () => Schema.String,
  }),
);

beforeEach(() => {
  useConvexQueryMock.mockReset();
  useConvexMutationMock.mockReset();
  useConvexActionMock.mockReset();
  useConvexPaginatedQueryMock.mockReset();
});

describe("useQuery", () => {
  test("returns Loading when convex returns undefined", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useQuery(queryNoError, {}));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(false);
  });

  test("returns Success with decoded value", () => {
    useConvexQueryMock.mockReturnValue([{ text: "hello" }]);

    const { result } = renderHook(() => useQuery(queryNoError, {}));

    assert(QueryResult.isSuccess(result.current));
    expect(result.current.value).toEqual([{ text: "hello" }]);
  });

  test("Failure carries decoded typed error for a matching ConvexError", () => {
    useConvexQueryMock.mockImplementation(() => {
      throw new ConvexError({ _tag: "NotFound", id: "abc" });
    });

    const { result } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );

    assert(QueryResult.isFailure(result.current));
    expect(result.current.error).toBeInstanceOf(NotFound);
    expect(result.current.error.id).toBe("abc");
  });

  test("rethrows a non-ConvexError as a defect", () => {
    const transportError = new Error("network down");
    useConvexQueryMock.mockImplementation(() => {
      throw transportError;
    });

    expect(() =>
      renderHook(() => useQuery(queryWithError, { id: "abc" })),
    ).toThrow(transportError);
  });

  test("rethrows a ConvexError from a ref without an error schema", () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    useConvexQueryMock.mockImplementation(() => {
      throw convexError;
    });

    expect(() => renderHook(() => useQuery(queryNoError, {}))).toThrow(
      convexError,
    );
  });

  test("`skip` on a query with no args returns Loading with skipped true", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useQuery(queryNoError, "skip"));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(true);
    expect(useConvexQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "skip",
    );
  });

  test("`skip` on a query with required args returns Loading with skipped true", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useQuery(queryWithError, "skip"));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(true);
    expect(useConvexQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "skip",
    );
  });

  test("preserves QueryResult identity across rerenders for an unchanged convex result", () => {
    const encodedResult = [{ text: "hello" }];
    useConvexQueryMock.mockReturnValue(encodedResult);

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  test("produces a new QueryResult when the convex result identity changes", () => {
    useConvexQueryMock.mockReturnValue([{ text: "hello" }]);

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    useConvexQueryMock.mockReturnValue([{ text: "hello" }]);
    rerender();

    expect(result.current).not.toBe(first);
    assert(QueryResult.isSuccess(result.current));
    expect(result.current.value).toEqual([{ text: "hello" }]);
  });

  test("preserves Loading identity across rerenders while convex returns undefined", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  test("preserves Failure identity across rerenders for an unchanged ConvexError", () => {
    const convexError = new ConvexError({ _tag: "NotFound", id: "abc" });
    useConvexQueryMock.mockImplementation(() => {
      throw convexError;
    });

    const { result, rerender } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );
    const first = result.current;
    assert(QueryResult.isFailure(first));

    rerender();

    expect(result.current).toBe(first);
  });

  test("produces a new Loading when `skipped` changes while convex returns undefined", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const { result, rerender } = renderHook(
      ({ args }: { args: {} | "skip" }) => useQuery(queryNoError, args),
      { initialProps: { args: {} as {} | "skip" } },
    );
    const first = result.current;
    assert(QueryResult.isLoading(first));
    expect(first.skipped).toBe(false);

    rerender({ args: "skip" });

    expect(result.current).not.toBe(first);
    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(true);
  });
});

describe("useMutation", () => {
  test("InvokeReturn is Promise<A> without an error schema", () => {
    expectTypeOf<InvokeReturn<typeof mutationNoError>>().toEqualTypeOf<
      Promise<string>
    >();
    expectTypeOf<InvokeReturn<typeof mutationWithError>>().toEqualTypeOf<
      Promise<Either.Either<null, NotFound>>
    >();
  });

  test("resolves directly to decoded result without an error schema", async () => {
    const inner = vi.fn().mockResolvedValue("note-1");
    useConvexMutationMock.mockReturnValue(inner);

    const { result } = renderHook(() => useMutation(mutationNoError));
    await expect(result.current({ text: "hi" })).resolves.toBe("note-1");
  });

  test("resolves to Either.Right with decoded result when error schema succeeds", async () => {
    const inner = vi.fn().mockResolvedValue(null);
    useConvexMutationMock.mockReturnValue(inner);

    const { result } = renderHook(() => useMutation(mutationWithError));
    const either = await result.current({ id: "abc" });

    assert(Either.isRight(either));
    expect(either.right).toBeNull();
  });

  test("resolves to Either.Left with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexMutationMock.mockReturnValue(inner);

    const { result } = renderHook(() => useMutation(mutationWithError));
    const either = await result.current({ id: "abc" });

    assert(Either.isLeft(either));
    assert(either.left instanceof NotFound);
    expect(either.left.id).toBe("abc");
  });

  test("rejects with the original error for a non-ConvexError", async () => {
    const transportError = new Error("network down");
    const inner = vi.fn().mockRejectedValue(transportError);
    useConvexMutationMock.mockReturnValue(inner);

    const { result } = renderHook(() => useMutation(mutationNoError));

    await expect(result.current({ text: "hi" })).rejects.toBe(transportError);
  });

  test("rejects with the original ConvexError for a ref without an error schema", async () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    const inner = vi.fn().mockRejectedValue(convexError);
    useConvexMutationMock.mockReturnValue(inner);

    const { result } = renderHook(() => useMutation(mutationNoError));

    await expect(result.current({ text: "hi" })).rejects.toBe(convexError);
  });

  test("preserves callback identity across rerenders", () => {
    const inner = vi.fn().mockResolvedValue("note-1");
    useConvexMutationMock.mockReturnValue(inner);

    const { result, rerender } = renderHook(() => useMutation(mutationNoError));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe("useAction", () => {
  test("InvokeReturn is Promise<A> without an error schema", () => {
    expectTypeOf<InvokeReturn<typeof actionNoError>>().toEqualTypeOf<
      Promise<string>
    >();
    expectTypeOf<InvokeReturn<typeof actionWithError>>().toEqualTypeOf<
      Promise<Either.Either<null, NotFound>>
    >();
  });

  test("resolves directly to decoded result without an error schema", async () => {
    const inner = vi.fn().mockResolvedValue("pong");
    useConvexActionMock.mockReturnValue(inner);

    const { result } = renderHook(() => useAction(actionNoError));
    await expect(result.current({})).resolves.toBe("pong");
  });

  test("resolves to Either.Right with decoded result when error schema succeeds", async () => {
    const inner = vi.fn().mockResolvedValue(null);
    useConvexActionMock.mockReturnValue(inner);

    const { result } = renderHook(() => useAction(actionWithError));
    const either = await result.current({ id: "abc" });

    assert(Either.isRight(either));
    expect(either.right).toBeNull();
  });

  test("resolves to Either.Left with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexActionMock.mockReturnValue(inner);

    const { result } = renderHook(() => useAction(actionWithError));
    const either = await result.current({ id: "abc" });

    assert(Either.isLeft(either));
    assert(either.left instanceof NotFound);
    expect(either.left.id).toBe("abc");
  });

  test("rejects with the original error for a non-ConvexError", async () => {
    const transportError = new Error("network down");
    const inner = vi.fn().mockRejectedValue(transportError);
    useConvexActionMock.mockReturnValue(inner);

    const { result } = renderHook(() => useAction(actionNoError));

    await expect(result.current({})).rejects.toBe(transportError);
  });

  test("preserves callback identity across rerenders", () => {
    const inner = vi.fn().mockResolvedValue("pong");
    useConvexActionMock.mockReturnValue(inner);

    const { result, rerender } = renderHook(() => useAction(actionNoError));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe("usePaginatedQuery", () => {
  const paginatedDoc = Schema.Struct({ value: Schema.NumberFromString });

  const paginatedQuery = Ref.make(
    "notes",
    FunctionSpec.publicQuery({
      name: "listPaginated",
      args: () =>
        Schema.Struct({
          count: Schema.NumberFromString,
          paginationOpts: PaginationOptions.PaginationOptions,
        }),
      returns: () => PaginationResult.PaginationResult(paginatedDoc),
    }),
  );

  const paginatedQueryNoExtraArgs = Ref.make(
    "notes",
    FunctionSpec.publicQuery({
      name: "listAllPaginated",
      args: () =>
        Schema.Struct({ paginationOpts: PaginationOptions.PaginationOptions }),
      returns: () => PaginationResult.PaginationResult(paginatedDoc),
    }),
  );

  class PaginationFailed extends Schema.TaggedError<PaginationFailed>()(
    "PaginationFailed",
    { reason: Schema.String },
  ) {}

  const paginatedQueryWithError = Ref.make(
    "notes",
    FunctionSpec.publicQuery({
      name: "listPaginatedOrFail",
      args: () =>
        Schema.Struct({ paginationOpts: PaginationOptions.PaginationOptions }),
      returns: () => PaginationResult.PaginationResult(paginatedDoc),
      error: () => PaginationFailed,
    }),
  );

  const canLoadMore = (results: unknown[]) => ({
    results,
    status: "CanLoadMore" as const,
    isLoading: false as const,
    loadMore: vi.fn(),
  });

  test("encodes args via the args schema, without paginationOpts", () => {
    useConvexPaginatedQueryMock.mockReturnValue(canLoadMore([]));

    renderHook(() =>
      usePaginatedQuery(paginatedQuery, { count: 42 }, { initialNumItems: 10 }),
    );

    expect(useConvexPaginatedQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      { count: "42" },
      { initialNumItems: 10 },
    );
  });

  test("passes `skip` through", () => {
    useConvexPaginatedQueryMock.mockReturnValue(canLoadMore([]));

    renderHook(() =>
      usePaginatedQuery(paginatedQuery, "skip", { initialNumItems: 10 }),
    );

    expect(useConvexPaginatedQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "skip",
      { initialNumItems: 10 },
    );
  });

  test("decodes the results via the returns schema's page element schema", () => {
    useConvexPaginatedQueryMock.mockReturnValue(
      canLoadMore([{ value: "1" }, { value: "2" }]),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );

    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
    expect(result.current.status).toBe("CanLoadMore");
  });

  test("preserves result identity across rerenders for an unchanged convex result", () => {
    useConvexPaginatedQueryMock.mockReturnValue(canLoadMore([{ value: "1" }]));

    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(result.current.results).toBe(first.results);
  });

  test("produces new results when the convex results identity changes", () => {
    useConvexPaginatedQueryMock.mockReturnValue(canLoadMore([{ value: "1" }]));

    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );
    const first = result.current;

    useConvexPaginatedQueryMock.mockReturnValue(
      canLoadMore([{ value: "1" }, { value: "2" }]),
    );
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("throws the decoded typed error for a matching ConvexError", () => {
    useConvexPaginatedQueryMock.mockImplementation(() => {
      throw new ConvexError({ _tag: "PaginationFailed", reason: "oops" });
    });

    expect(() =>
      renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      ),
    ).toThrow(PaginationFailed);
  });

  test("rethrows a ConvexError from a ref without an error schema", () => {
    const convexError = new ConvexError({ code: "ERR" });
    useConvexPaginatedQueryMock.mockImplementation(() => {
      throw convexError;
    });

    expect(() =>
      renderHook(() =>
        usePaginatedQuery(
          paginatedQueryNoExtraArgs,
          {},
          { initialNumItems: 10 },
        ),
      ),
    ).toThrow(convexError);
  });

  test("rethrows a non-ConvexError unchanged", () => {
    const transportError = new Error("network down");
    useConvexPaginatedQueryMock.mockImplementation(() => {
      throw transportError;
    });

    expect(() =>
      renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      ),
    ).toThrow(transportError);
  });

  describe("UsePaginatedQueryArgs", () => {
    test("accepts the args minus paginationOpts, or `skip`", () => {
      expectTypeOf<{ count: number }>().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQuery>
      >();
      expectTypeOf<"skip">().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQuery>
      >();
    });

    test("accepts only the empty object or `skip` when paginationOpts is the only arg", () => {
      expectTypeOf<{}>().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQueryNoExtraArgs>
      >();
      expectTypeOf<"skip">().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQueryNoExtraArgs>
      >();
      // `{} | "skip"` would absorb these; `Record<string, never> | "skip"`
      // rejects them.
      expectTypeOf<"skipp">().not.toExtend<
        UsePaginatedQueryArgs<typeof paginatedQueryNoExtraArgs>
      >();
      expectTypeOf<number>().not.toExtend<
        UsePaginatedQueryArgs<typeof paginatedQueryNoExtraArgs>
      >();
    });

    test("rejects paginationOpts in an args literal", () => {
      const check = () =>
        usePaginatedQuery(
          paginatedQuery,
          {
            count: 42,
            // @ts-expect-error — paginationOpts is managed by the hook, not the caller
            paginationOpts: { numItems: 10, cursor: null },
          },
          { initialNumItems: 10 },
        );

      expect(check).toBeDefined();
    });
  });
});
