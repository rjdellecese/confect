import { FunctionSpec, Ref } from "@confect/core";
import { it } from "@effect/vitest";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
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
  PaginatedQueryResult,
  QueryResult,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "@confect/react";

const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();
const useConvexActionMock = vi.fn();
const useConvexPaginatedQueryInternalMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useMutation: (...args: unknown[]) => useConvexMutationMock(...args),
  useAction: (...args: unknown[]) => useConvexActionMock(...args),
  usePaginatedQuery: () => {
    throw new Error("unexpected call to the public usePaginatedQuery");
  },
  usePaginatedQueryInternal: (...args: unknown[]) =>
    useConvexPaginatedQueryInternalMock(...args),
}));

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
    error: () => NotFound,
  }),
);

const queryNoError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    returns: () => Schema.Array(Schema.Struct({ text: Schema.String })),
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const mutationNoError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => ({ text: Schema.String }),
    returns: () => Schema.String,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const actionNoError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "ping",
    returns: () => Schema.String,
  }),
);

beforeEach(() => {
  useConvexQueryMock.mockReset();
  useConvexMutationMock.mockReset();
  useConvexActionMock.mockReset();
  useConvexPaginatedQueryInternalMock.mockReset();
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
      Promise<Result.Result<null, NotFound>>
    >();
  });

  it.effect("resolves directly to decoded result without an error schema", () =>
    Effect.gen(function* () {
      const inner = vi.fn().mockResolvedValue("note-1");
      useConvexMutationMock.mockReturnValue(inner);

      const { result } = renderHook(() => useMutation(mutationNoError));
      yield* Effect.promise(() =>
        expect(result.current({ text: "hi" })).resolves.toBe("note-1"),
      );
    }),
  );

  it.effect(
    "resolves to Result.Success with decoded result when error schema succeeds",
    () =>
      Effect.gen(function* () {
        const inner = vi.fn().mockResolvedValue(null);
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        assert(Result.isSuccess(result_));
        expect(result_.success).toBeNull();
      }),
  );

  it.effect(
    "resolves to Result.Failure with the decoded typed error for a matching ConvexError",
    () =>
      Effect.gen(function* () {
        const inner = vi
          .fn()
          .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        assert(Result.isFailure(result_));
        assert(Schema.is(NotFound)(result_.failure));
        expect(result_.failure.id).toBe("abc");
      }),
  );

  it.effect("rejects with the original error for a non-ConvexError", () =>
    Effect.gen(function* () {
      const transportError = new Error("network down");
      const inner = vi.fn().mockRejectedValue(transportError);
      useConvexMutationMock.mockReturnValue(inner);

      const { result } = renderHook(() => useMutation(mutationNoError));

      yield* Effect.promise(() =>
        expect(result.current({ text: "hi" })).rejects.toBe(transportError),
      );
    }),
  );

  it.effect(
    "rejects with the original ConvexError for a ref without an error schema",
    () =>
      Effect.gen(function* () {
        const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
        const inner = vi.fn().mockRejectedValue(convexError);
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationNoError));

        yield* Effect.promise(() =>
          expect(result.current({ text: "hi" })).rejects.toBe(convexError),
        );
      }),
  );

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
      Promise<Result.Result<null, NotFound>>
    >();
  });

  it.effect("resolves directly to decoded result without an error schema", () =>
    Effect.gen(function* () {
      const inner = vi.fn().mockResolvedValue("pong");
      useConvexActionMock.mockReturnValue(inner);

      const { result } = renderHook(() => useAction(actionNoError));
      yield* Effect.promise(() =>
        expect(result.current({})).resolves.toBe("pong"),
      );
    }),
  );

  it.effect(
    "resolves to Result.Success with decoded result when error schema succeeds",
    () =>
      Effect.gen(function* () {
        const inner = vi.fn().mockResolvedValue(null);
        useConvexActionMock.mockReturnValue(inner);

        const { result } = renderHook(() => useAction(actionWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        assert(Result.isSuccess(result_));
        expect(result_.success).toBeNull();
      }),
  );

  it.effect(
    "resolves to Result.Failure with the decoded typed error for a matching ConvexError",
    () =>
      Effect.gen(function* () {
        const inner = vi
          .fn()
          .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
        useConvexActionMock.mockReturnValue(inner);

        const { result } = renderHook(() => useAction(actionWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        assert(Result.isFailure(result_));
        assert(Schema.is(NotFound)(result_.failure));
        expect(result_.failure.id).toBe("abc");
      }),
  );

  it.effect("rejects with the original error for a non-ConvexError", () =>
    Effect.gen(function* () {
      const transportError = new Error("network down");
      const inner = vi.fn().mockRejectedValue(transportError);
      useConvexActionMock.mockReturnValue(inner);

      const { result } = renderHook(() => useAction(actionNoError));

      yield* Effect.promise(() =>
        expect(result.current({})).rejects.toBe(transportError),
      );
    }),
  );

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
  const paginatedDoc = Schema.Struct({ value: Schema.FiniteFromString });

  const paginatedQuery = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginated",
      args: () => ({ count: Schema.FiniteFromString }),
      item: () => paginatedDoc,
    }),
  );

  const paginatedQueryNoExtraArgs = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "listAllPaginated",
      item: () => paginatedDoc,
    }),
  );

  class PaginationFailed extends Schema.TaggedError<PaginationFailed>()(
    "PaginationFailed",
    { reason: Schema.String },
  ) {}

  const paginatedQueryWithError = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginatedOrFail",
      item: () => paginatedDoc,
      error: () => PaginationFailed,
    }),
  );

  const user = (
    partial: Partial<{
      results: unknown[];
      status: string;
      isLoading: boolean;
      loadMore: (numItems: number) => void;
      error: unknown;
    }>,
  ) => ({
    user: {
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: vi.fn(),
      ...partial,
    },
  });

  test("encodes args via the user-args schema and disables throwOnError", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(user({}));

    renderHook(() =>
      usePaginatedQuery(paginatedQuery, { count: 42 }, { initialNumItems: 10 }),
    );

    expect(useConvexPaginatedQueryInternalMock).toHaveBeenLastCalledWith(
      expect.anything(),
      { count: "42" },
      { initialNumItems: 10 },
      false,
    );
  });

  test("passes `skip` through and reports it on LoadingFirstPage", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ status: "LoadingFirstPage", isLoading: true }),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQuery, "skip", { initialNumItems: 10 }),
    );

    expect(useConvexPaginatedQueryInternalMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "skip",
      { initialNumItems: 10 },
      false,
    );
    assert(PaginatedQueryResult.isLoadingFirstPage(result.current));
    expect(result.current.skipped).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.results).toEqual([]);
  });

  test("decodes the results via the ref's item schema", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ results: [{ value: "1" }, { value: "2" }] }),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );

    assert(PaginatedQueryResult.isCanLoadMore(result.current));
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test.each([
    ["LoadingFirstPage", true],
    ["LoadingMore", true],
    ["CanLoadMore", false],
    ["Exhausted", false],
  ] as const)("maps status %s to its variant", (status, isLoading) => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ status, isLoading, results: [{ value: "1" }] }),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );

    expect(result.current._tag).toBe(status);
    assert(!PaginatedQueryResult.isFailure(result.current));
    expect(result.current.isLoading).toBe(isLoading);
  });

  test.each([
    ["LoadingFirstPage", false],
    ["LoadingMore", false],
    ["CanLoadMore", true],
    ["Exhausted", false],
    ["Error", false],
  ] as const)(
    "carries convex's loadMore on %s: %s",
    (status, carriesLoadMore) => {
      const loadMore = vi.fn();
      useConvexPaginatedQueryInternalMock.mockReturnValue(
        user({
          status,
          results: [{ value: "1" }],
          loadMore,
          error: new ConvexError({ _tag: "PaginationFailed", reason: "oops" }),
        }),
      );

      const { result } = renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      );

      expect("loadMore" in result.current).toBe(carriesLoadMore);
      if (PaginatedQueryResult.isCanLoadMore(result.current)) {
        expect(result.current.loadMore).toBe(loadMore);
      }
    },
  );

  test("preserves result identity across rerenders for an unchanged convex result", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ results: [{ value: "1" }] }),
    );

    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    assert(!PaginatedQueryResult.isFailure(result.current));
    assert(!PaginatedQueryResult.isFailure(first));
    expect(result.current.results).toBe(first.results);
  });

  test("produces new results when the convex results identity changes", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ results: [{ value: "1" }] }),
    );

    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(paginatedQueryNoExtraArgs, {}, { initialNumItems: 10 }),
    );
    const first = result.current;

    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ results: [{ value: "1" }, { value: "2" }] }),
    );
    rerender();

    expect(result.current).not.toBe(first);
    assert(!PaginatedQueryResult.isFailure(result.current));
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("returns Failure with the decoded typed error for a matching ConvexError", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({
        status: "Error",
        error: new ConvexError({ _tag: "PaginationFailed", reason: "oops" }),
      }),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
    );

    assert(PaginatedQueryResult.isFailure(result.current));
    expect(result.current.error).toBeInstanceOf(PaginationFailed);
    expect(result.current.error.reason).toBe("oops");
  });

  test("Failure keeps the pages loaded before the failure", () => {
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({
        status: "Error",
        results: [{ value: "1" }, { value: "2" }],
        error: new ConvexError({ _tag: "PaginationFailed", reason: "oops" }),
      }),
    );

    const { result } = renderHook(() =>
      usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
    );

    assert(PaginatedQueryResult.isFailure(result.current));
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("throws a ConvexError from a ref without an error schema", () => {
    const convexError = new ConvexError({ code: "ERR" });
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ status: "Error", error: convexError }),
    );

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

  test("throws a non-ConvexError unchanged", () => {
    const transportError = new Error("network down");
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ status: "Error", error: transportError }),
    );

    expect(() =>
      renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      ),
    ).toThrow(transportError);
  });

  test("throws the original ConvexError when it does not match the error schema", () => {
    // Convex raises its own `ConvexError`s, which never match a user-declared
    // error schema. The original must survive rather than being replaced by a
    // decode failure.
    const systemError = new ConvexError({
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    });
    useConvexPaginatedQueryInternalMock.mockReturnValue(
      user({ status: "Error", error: systemError }),
    );

    expect(() =>
      renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      ),
    ).toThrow(systemError);
  });

  describe("types", () => {
    test("the result type carries the item and error types", () => {
      useConvexPaginatedQueryInternalMock.mockReturnValue(user({}));

      const { result } = renderHook(() =>
        usePaginatedQuery(paginatedQueryWithError, {}, { initialNumItems: 10 }),
      );

      expectTypeOf(result.current).toEqualTypeOf<
        PaginatedQueryResult.PaginatedQueryResult<
          { readonly value: number },
          PaginationFailed
        >
      >();
    });

    test("the error type is never without an error schema", () => {
      useConvexPaginatedQueryInternalMock.mockReturnValue(user({}));

      const { result } = renderHook(() =>
        usePaginatedQuery(
          paginatedQueryNoExtraArgs,
          {},
          { initialNumItems: 10 },
        ),
      );

      expectTypeOf(result.current).toEqualTypeOf<
        PaginatedQueryResult.PaginatedQueryResult<{ readonly value: number }>
      >();
    });
  });

  describe("UsePaginatedQueryArgs", () => {
    test("accepts the user args, or `skip`", () => {
      expectTypeOf<{ count: number }>().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQuery>
      >();
      expectTypeOf<"skip">().toExtend<
        UsePaginatedQueryArgs<typeof paginatedQuery>
      >();
    });

    test("accepts only the empty object or `skip` when there are no user args", () => {
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
