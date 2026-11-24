import { FunctionSpec, Ref } from "@confect/core";
import { it } from "@effect/vitest";
import { renderHook } from "@testing-library/react";
import { runInNewContext } from "node:vm";
import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { RequestForQueries } from "convex/react";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  assert,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
} from "@effect/vitest";
import { vi } from "vitest";
import type {
  InvokeReturn,
  OptimisticLocalStore,
  OptimisticUpdate,
  PaginatedQueryArgs,
  PaginatedQueryItem,
  ReactMutation,
  UsePaginatedQueryArgs,
} from "@confect/react";
import type {
  OptimisticUpdate as ConvexOptimisticUpdate,
  OptimisticLocalStore as NativeStore,
} from "convex/browser";
import * as Leaf from "@confect/react/OptimisticLocalStore";
import {
  PaginatedQueryResult,
  QueryResult,
  insertAtTop,
  insertAtBottomIfLoaded,
  insertAtPosition,
  optimisticallyUpdateValueInPaginatedQuery,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "@confect/react";

const user = (
  partial: Partial<{
    results: Array<unknown>;
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
    loadMore: vi.fn<(numItems: number) => void>(),
    ...partial,
  },
});

type WireCall = (args: Record<string, Value>) => Promise<Value>;
const {
  useConvexQueriesMock,
  useConvexMutationMock,
  useConvexActionMock,
  useConvexPaginatedQueryInternalMock,
} = vi.hoisted(() => ({
  useConvexQueriesMock:
    vi.fn<
      (queries: RequestForQueries) => { query?: Value | Error | undefined }
    >(),
  useConvexMutationMock:
    vi.fn<(mutation: FunctionReference<"mutation">) => WireCall>(),
  useConvexActionMock:
    vi.fn<(action: FunctionReference<"action">) => WireCall>(),
  useConvexPaginatedQueryInternalMock:
    vi.fn<
      (
        query: FunctionReference<"query">,
        args: Record<string, Value> | "skip",
        options: { initialNumItems: number },
        throwOnError: boolean,
      ) => ReturnType<typeof user>
    >(),
}));

vi.mock("convex/react", () => ({
  useQueries: useConvexQueriesMock,
  useMutation: useConvexMutationMock,
  useAction: useConvexActionMock,
  usePaginatedQuery: () => {
    throw new Error("unexpected call to the public usePaginatedQuery");
  },
  usePaginatedQueryInternal: useConvexPaginatedQueryInternalMock,
}));

class NotFound extends Schema.TaggedError<
  NotFound,
  { readonly brand: unique symbol }
>()("NotFound", {
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
  useConvexQueriesMock.mockReset();
  useConvexMutationMock.mockReset();
  useConvexActionMock.mockReset();
  useConvexPaginatedQueryInternalMock.mockReset();
});

const foreignError = () => {
  const error: unknown = runInNewContext('new Error("foreign failure")');
  assert(Error.isError(error));
  return error;
};

describe("useQuery", () => {
  test("returns Loading when convex returns undefined", () => {
    useConvexQueriesMock.mockReturnValue({});

    const { result } = renderHook(() => useQuery(queryNoError, {}));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(false);
  });

  test("returns Success with decoded value", () => {
    useConvexQueriesMock.mockReturnValue({ query: [{ text: "hello" }] });

    const { result } = renderHook(() => useQuery(queryNoError, {}));

    assert(QueryResult.isSuccess(result.current));
    expect(result.current.value).toEqual([{ text: "hello" }]);
  });

  test("Failure carries decoded typed error for a matching ConvexError", () => {
    useConvexQueriesMock.mockReturnValue({
      query: new ConvexError({ _tag: "NotFound", id: "abc" }),
    });

    const { result } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );

    assert(QueryResult.isFailure(result.current));
    expect(result.current.error).toBeInstanceOf(NotFound);
    expect(result.current.error.id).toBe("abc");
  });

  test("decodes a declared ConvexError from another realm", () => {
    const error = Object.assign(foreignError(), {
      [Symbol.for("ConvexError")]: true,
      data: { _tag: "NotFound", id: "abc" },
    });
    expect(error).not.toBeInstanceOf(Error);
    useConvexQueriesMock.mockReturnValue({ query: error });

    const { result } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );

    assert(QueryResult.isFailure(result.current));
    expect(result.current.error).toBeInstanceOf(NotFound);
    expect(result.current.error.id).toBe("abc");
  });

  test.each(["ConvexError", "Error"])(
    "rethrows an undeclared foreign %s unchanged",
    (kind) => {
      const error =
        kind === "ConvexError"
          ? Object.assign(foreignError(), {
              [Symbol.for("ConvexError")]: true,
              data: { _tag: "Other" },
            })
          : foreignError();
      expect(error).not.toBeInstanceOf(Error);
      useConvexQueriesMock.mockReturnValue({ query: error });

      const thrown = Result.try(() =>
        renderHook(() => useQuery(queryWithError, { id: "abc" })),
      ).pipe(Result.flip, Result.getOrThrow);
      expect(thrown).toBe(error);
    },
  );

  test("decodes an error-shaped Convex record as a success", () => {
    useConvexQueriesMock.mockReturnValue({
      query: {
        name: "ConvexError",
        message: "ordinary data",
        data: { _tag: "NotFound", id: "abc" },
        text: "hello",
      },
    });

    const { result } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );

    expect(result.current).toEqual(QueryResult.succeed({ text: "hello" }));
  });

  test("rethrows a non-ConvexError as a defect", () => {
    const transportError = new Error("network down");
    useConvexQueriesMock.mockReturnValue({ query: transportError });

    expect(() =>
      renderHook(() => useQuery(queryWithError, { id: "abc" })),
    ).toThrow(transportError);
  });

  test("rethrows a ConvexError from a ref without an error schema", () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    useConvexQueriesMock.mockReturnValue({ query: convexError });

    expect(() => renderHook(() => useQuery(queryNoError, {}))).toThrow(
      convexError,
    );
  });

  test("`skip` on a query with no args returns Loading with skipped true", () => {
    useConvexQueriesMock.mockReturnValue({});

    const { result } = renderHook(() => useQuery(queryNoError, "skip"));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(true);
    expect(useConvexQueriesMock).toHaveBeenLastCalledWith({});
  });

  test("`skip` on a query with required args returns Loading with skipped true", () => {
    useConvexQueriesMock.mockReturnValue({});

    const { result } = renderHook(() => useQuery(queryWithError, "skip"));

    assert(QueryResult.isLoading(result.current));
    expect(result.current.skipped).toBe(true);
    expect(useConvexQueriesMock).toHaveBeenLastCalledWith({});
  });

  test("preserves QueryResult identity across rerenders for an unchanged convex result", () => {
    const encodedResult = [{ text: "hello" }];
    useConvexQueriesMock.mockReturnValue({ query: encodedResult });

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    const requests = useConvexQueriesMock.mock.lastCall?.[0];
    expect(requests).toEqual({
      query: { query: Ref.getFunctionReference(queryNoError), args: {} },
    });
    rerender();
    expect(useConvexQueriesMock.mock.lastCall?.[0]).toBe(requests);

    expect(result.current).toBe(first);
  });

  test("produces a new QueryResult when the convex result identity changes", () => {
    useConvexQueriesMock.mockReturnValue({ query: [{ text: "hello" }] });

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    useConvexQueriesMock.mockReturnValue({ query: [{ text: "hello" }] });
    rerender();

    expect(result.current).not.toBe(first);
    assert(QueryResult.isSuccess(result.current));
    expect(result.current.value).toEqual([{ text: "hello" }]);
  });

  test("preserves Loading identity across rerenders while convex returns undefined", () => {
    useConvexQueriesMock.mockReturnValue({});

    const { result, rerender } = renderHook(() => useQuery(queryNoError, {}));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  test("preserves Failure identity across rerenders for an unchanged ConvexError", () => {
    const convexError = new ConvexError({ _tag: "NotFound", id: "abc" });
    useConvexQueriesMock.mockReturnValue({ query: convexError });

    const { result, rerender } = renderHook(() =>
      useQuery(queryWithError, { id: "abc" }),
    );
    const first = result.current;
    assert(QueryResult.isFailure(first));

    rerender();

    expect(result.current).toBe(first);
  });

  test("resubscribes with changed arguments and recovers from a declared error", () => {
    useConvexQueriesMock.mockReturnValue({
      query: new ConvexError({ _tag: "NotFound", id: "missing" }),
    });
    const { result, rerender } = renderHook(
      ({ id }) => useQuery(queryWithError, { id }),
      { initialProps: { id: "missing" } },
    );
    assert(QueryResult.isFailure(result.current));
    expect(result.current.error.id).toBe("missing");

    useConvexQueriesMock.mockReturnValue({ query: { text: "found" } });
    rerender({ id: "present" });
    expect(useConvexQueriesMock).toHaveBeenLastCalledWith({
      query: {
        query: Ref.getFunctionReference(queryWithError),
        args: { id: "present" },
      },
    });
    expect(result.current).toEqual(QueryResult.succeed({ text: "found" }));
  });

  test("produces a new Loading when `skipped` changes while convex returns undefined", () => {
    useConvexQueriesMock.mockReturnValue({});

    const { result, rerender } = renderHook(
      ({ args }: { args: Record<string, never> | "skip" }) =>
        useQuery(queryNoError, args),
      { initialProps: { args: {} } },
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

const promiseUpdate: (
  store: OptimisticLocalStore.OptimisticLocalStore,
  args: Ref.Args<typeof mutationNoError>,
) => Promise<void> = () => Promise.resolve();

const checkPromiseCallbacks = (
  mutation: ReactMutation<typeof mutationNoError>,
) => {
  // @ts-expect-error Optimistic callbacks must be synchronous.
  // oxlint-disable-next-line effecttsgo/async-function -- Regression coverage must exercise an async callback.
  mutation.withOptimisticUpdate(async () => {});
  // @ts-expect-error Returning a promise without async is also invalid.
  mutation.withOptimisticUpdate(() => Promise.resolve("note-1"));

  // @ts-expect-error Explicit promise return types must also be rejected.
  mutation.withOptimisticUpdate(promiseUpdate);

  const configured = mutation.withOptimisticUpdate(() => {});
  // @ts-expect-error Configured handles retain the synchronous constraint.
  configured.withOptimisticUpdate(promiseUpdate);
};

const synchronousUpdate: OptimisticUpdate<typeof mutationNoError> = (
  store,
  args,
) => {
  expectTypeOf(
    store,
  ).toEqualTypeOf<OptimisticLocalStore.OptimisticLocalStore>();
  expectTypeOf(args).toEqualTypeOf<{ readonly text: string }>();
};

const checkSynchronousCallbacks = (
  mutation: ReactMutation<typeof mutationNoError>,
) => {
  const configured = mutation.withOptimisticUpdate(synchronousUpdate);
  expectTypeOf(configured).toEqualTypeOf<
    ReactMutation<typeof mutationNoError>
  >();
  expectTypeOf(configured({ text: "hi" })).toEqualTypeOf<Promise<string>>();
  mutation.withOptimisticUpdate(() => undefined);
  mutation.withOptimisticUpdate((_store, args) => args.text.length);
};

describe("useMutation", () => {
  test("rejects inferred and explicitly typed promise-returning optimistic callbacks", () => {
    expect(checkPromiseCallbacks).toBeDefined();
  });

  test("preserves synchronous callback forms and callable handle types", () => {
    expect(checkSynchronousCallbacks).toBeDefined();
  });

  it.effect(
    "attaches a synchronous update with decoded args and store values",
    () =>
      Effect.gen(function* () {
        const mutation = Ref.make(
          "counts",
          FunctionSpec.publicMutation({
            name: "increment",
            args: () => ({ count: Schema.FiniteFromString }),
            returns: () => Schema.FiniteFromString,
          }),
        );
        const query = Ref.make(
          "counts",
          FunctionSpec.publicQuery({
            name: "get",
            args: () => ({ count: Schema.FiniteFromString }),
            returns: () => Schema.FiniteFromString,
          }),
        );
        const encodedArgs = { count: "41" };
        const args = { count: 41 };
        const setQuery = vi.fn<NativeStore["setQuery"]>();
        const store: NativeStore = {
          getQuery: () => undefined,
          getAllQueries: () => [],
          setQuery,
        };
        const getQuery = vi.spyOn(store, "getQuery").mockReturnValue("41");
        const next = Object.assign(vi.fn<WireCall>().mockResolvedValue("42"), {
          withOptimisticUpdate:
            vi.fn<
              (update: ConvexOptimisticUpdate<{ count: string }>) => WireCall
            >(),
        });
        const attach = vi
          .fn<
            (update: ConvexOptimisticUpdate<{ count: string }>) => typeof next
          >()
          .mockReturnValue(next);
        const original = Object.assign(vi.fn<WireCall>(), {
          withOptimisticUpdate: attach,
        });
        useConvexMutationMock.mockReturnValue(original);
        const { result } = renderHook(() => useMutation(mutation));
        const update = vi.fn<OptimisticUpdate<typeof mutation>>(
          (localStore, decodedArgs) => {
            expect(decodedArgs).toEqual(args);
            const value = localStore.getQuery(query, decodedArgs);
            expect(value).toEqual(Option.some(41));
            localStore.setQuery(
              query,
              decodedArgs,
              Option.map(value, (count) => count + 1),
            );
          },
        );
        const configured = result.current.withOptimisticUpdate(
          (localStore, decodedArgs) => {
            expectTypeOf(decodedArgs).toEqualTypeOf<{
              readonly count: number;
            }>();
            update(localStore, decodedArgs);
          },
        );
        expect(configured).not.toBe(result.current);
        expect("withOptimisticUpdate" in configured).toBe(true);
        expect(update).not.toHaveBeenCalled();
        const wrappedUpdate = attach.mock.calls[0]?.[0];
        assert(wrappedUpdate !== undefined);
        wrappedUpdate(store, encodedArgs);
        expect(update).toHaveBeenCalledOnce();
        expect(getQuery).toHaveBeenCalledWith(
          Ref.getFunctionReference(query),
          encodedArgs,
        );
        expect(setQuery).toHaveBeenCalledWith(
          Ref.getFunctionReference(query),
          encodedArgs,
          "42",
        );
        const value = yield* Effect.promise(() => configured(args));
        expect(value).toBe(42);
        expect(next).toHaveBeenCalledWith(encodedArgs);
        expect(original).not.toHaveBeenCalled();
        expect(args).toEqual({ count: 41 });
        expect(encodedArgs).toEqual({ count: "41" });
      }),
  );

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
      const inner = vi.fn<WireCall>().mockResolvedValue("note-1");
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
        const inner = vi.fn<WireCall>().mockResolvedValue(null);
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        const result_IsSuccess = Result.isSuccess(result_);

        assert(result_IsSuccess);
        expect(result_.success).toBeNull();
      }),
  );

  it.effect(
    "resolves to Result.Failure with the decoded typed error for a matching ConvexError",
    () =>
      Effect.gen(function* () {
        const inner = vi
          .fn<WireCall>()
          .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        const result_IsFailure = Result.isFailure(result_);

        assert(result_IsFailure);
        const isNotFound = Schema.is(NotFound)(result_.failure);
        assert(isNotFound);
        expect(result_.failure.id).toBe("abc");
      }),
  );

  it.effect("rejects with the original error for a non-ConvexError", () =>
    Effect.gen(function* () {
      const transportError = new Error("network down");
      const inner = vi.fn<WireCall>().mockRejectedValue(transportError);
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
        const inner = vi.fn<WireCall>().mockRejectedValue(convexError);
        useConvexMutationMock.mockReturnValue(inner);

        const { result } = renderHook(() => useMutation(mutationNoError));

        yield* Effect.promise(() =>
          expect(result.current({ text: "hi" })).rejects.toBe(convexError),
        );
      }),
  );

  test("preserves callback identity across rerenders", () => {
    const inner = vi.fn<WireCall>().mockResolvedValue("note-1");
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
      const inner = vi.fn<WireCall>().mockResolvedValue("pong");
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
        const inner = vi.fn<WireCall>().mockResolvedValue(null);
        useConvexActionMock.mockReturnValue(inner);

        const { result } = renderHook(() => useAction(actionWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        const result_IsSuccess = Result.isSuccess(result_);

        assert(result_IsSuccess);
        expect(result_.success).toBeNull();
      }),
  );

  it.effect(
    "resolves to Result.Failure with the decoded typed error for a matching ConvexError",
    () =>
      Effect.gen(function* () {
        const inner = vi
          .fn<WireCall>()
          .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
        useConvexActionMock.mockReturnValue(inner);

        const { result } = renderHook(() => useAction(actionWithError));
        const result_ = yield* Effect.promise(() =>
          result.current({ id: "abc" }),
        );

        const result_IsFailure = Result.isFailure(result_);

        assert(result_IsFailure);
        const isNotFound = Schema.is(NotFound)(result_.failure);
        assert(isNotFound);
        expect(result_.failure.id).toBe("abc");
      }),
  );

  it.effect("rejects with the original error for a non-ConvexError", () =>
    Effect.gen(function* () {
      const transportError = new Error("network down");
      const inner = vi.fn<WireCall>().mockRejectedValue(transportError);
      useConvexActionMock.mockReturnValue(inner);

      const { result } = renderHook(() => useAction(actionNoError));

      yield* Effect.promise(() =>
        expect(result.current({})).rejects.toBe(transportError),
      );
    }),
  );

  test("preserves callback identity across rerenders", () => {
    const inner = vi.fn<WireCall>().mockResolvedValue("pong");
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

  class PaginationFailed extends Schema.TaggedError<
    PaginationFailed,
    { readonly brand: unique symbol }
  >()("PaginationFailed", { reason: Schema.String }) {}

  const paginatedQueryWithError = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginatedOrFail",
      item: () => paginatedDoc,
      error: () => PaginationFailed,
    }),
  );

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
      const loadMore = vi.fn<(numItems: number) => void>();
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
      expect(
        PaginatedQueryResult.isCanLoadMore(result.current)
          ? result.current.loadMore
          : undefined,
      ).toBe(carriesLoadMore ? loadMore : undefined);
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

  const useInvalidArgs = () =>
    usePaginatedQuery(
      paginatedQuery,
      {
        count: 42,
        // @ts-expect-error—paginationOpts is managed by the hook, not the caller
        paginationOpts: { numItems: 10, cursor: null },
      },
      { initialNumItems: 10 },
    );

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
      expectTypeOf({}).toExtend<
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
      expect(useInvalidArgs).toBeDefined();
    });
  });
});

describe("pagination type re-exports", () => {
  const query = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "list",
      args: () => ({
        count: Schema.FiniteFromString,
        label: Schema.optionalKey(Schema.String),
      }),
      item: () => Schema.Struct({ value: Schema.FiniteFromString }),
    }),
  );
  const noArgsQuery = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "all",
      item: () => Schema.Finite,
    }),
  );

  test("root aliases preserve the shared decoded types and optional modifiers", () => {
    expectTypeOf<PaginatedQueryArgs<typeof query>>().toEqualTypeOf<
      Ref.PaginatedArgs<typeof query>
    >();
    expectTypeOf<PaginatedQueryItem<typeof query>>().toEqualTypeOf<
      Ref.PaginatedItem<typeof query>
    >();
    expectTypeOf<PaginatedQueryArgs<typeof query>>().toEqualTypeOf<{
      readonly count: number;
      readonly label?: string;
    }>();
    expectTypeOf<PaginatedQueryItem<typeof query>>().toEqualTypeOf<{
      readonly value: number;
    }>();
    expectTypeOf<PaginatedQueryArgs<typeof noArgsQuery>>().toEqualTypeOf<
      Record<string, never>
    >();
  });

  test("root and leaf helper exports retain the same functions and generic signatures", () => {
    expectTypeOf(Leaf.insertAtTop<typeof query>).toEqualTypeOf<
      typeof insertAtTop<typeof query>
    >();
    expectTypeOf(Leaf.insertAtBottomIfLoaded<typeof query>).toEqualTypeOf<
      typeof insertAtBottomIfLoaded<typeof query>
    >();
    expectTypeOf(Leaf.insertAtPosition<typeof query>).toEqualTypeOf<
      typeof insertAtPosition<typeof query>
    >();
    expectTypeOf(
      Leaf.optimisticallyUpdateValueInPaginatedQuery<typeof query>,
    ).toEqualTypeOf<
      typeof optimisticallyUpdateValueInPaginatedQuery<typeof query>
    >();
    expect(Leaf.insertAtTop).toBe(insertAtTop);
    expect(Leaf.insertAtBottomIfLoaded).toBe(insertAtBottomIfLoaded);
    expect(Leaf.insertAtPosition).toBe(insertAtPosition);
    expect(Leaf.optimisticallyUpdateValueInPaginatedQuery).toBe(
      optimisticallyUpdateValueInPaginatedQuery,
    );
  });
});
