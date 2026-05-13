import { FunctionSpec, Ref } from "@confect/core";
import { ConvexError } from "convex/values";
import { Either, Schema } from "effect";
import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import type { InvokeReturn } from "../src/index";
import { QueryResult, useAction, useMutation, useQuery } from "../src/index";

const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();
const useConvexActionMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useMutation: (...args: unknown[]) => useConvexMutationMock(...args),
  useAction: (...args: unknown[]) => useConvexActionMock(...args),
}));

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Struct({ text: Schema.String }),
    error: NotFound,
  }),
);

const queryNoError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: Schema.Struct({}),
    returns: Schema.Array(Schema.Struct({ text: Schema.String })),
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NotFound,
  }),
);

const mutationNoError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: Schema.Struct({ text: Schema.String }),
    returns: Schema.String,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NotFound,
  }),
);

const actionNoError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "ping",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);

beforeEach(() => {
  useConvexQueryMock.mockReset();
  useConvexMutationMock.mockReset();
  useConvexActionMock.mockReset();
});

describe("useQuery", () => {
  test("returns Loading when convex returns undefined", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const queryResult = useQuery(queryNoError, {});

    expect(QueryResult.isLoading(queryResult)).toBe(true);
    if (QueryResult.isLoading(queryResult)) {
      expect(queryResult.skipped).toBe(false);
    }
  });

  test("returns Success with decoded value", () => {
    useConvexQueryMock.mockReturnValue([{ text: "hello" }]);

    const queryResult = useQuery(queryNoError, {});

    expect(QueryResult.isSuccess(queryResult)).toBe(true);
    if (QueryResult.isSuccess(queryResult)) {
      expect(queryResult.value).toEqual([{ text: "hello" }]);
    }
  });

  test("Failure carries decoded typed error for a matching ConvexError", () => {
    useConvexQueryMock.mockImplementation(() => {
      throw new ConvexError({ _tag: "NotFound", id: "abc" });
    });

    const queryResult = useQuery(queryWithError, { id: "abc" });

    expect(QueryResult.isFailure(queryResult)).toBe(true);
    if (QueryResult.isFailure(queryResult)) {
      expect(queryResult.error).toBeInstanceOf(NotFound);
      expect(queryResult.error.id).toBe("abc");
    }
  });

  test("rethrows a non-ConvexError as a defect", () => {
    const transportError = new Error("network down");
    useConvexQueryMock.mockImplementation(() => {
      throw transportError;
    });

    expect(() => useQuery(queryWithError, { id: "abc" })).toThrow(
      transportError,
    );
  });

  test("rethrows a ConvexError from a ref without an error schema", () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    useConvexQueryMock.mockImplementation(() => {
      throw convexError;
    });

    expect(() => useQuery(queryNoError, {})).toThrow(convexError);
  });

  test("`skip` on a query with no args returns Loading with skipped true", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const queryResult = useQuery(queryNoError, "skip");

    expect(QueryResult.isLoading(queryResult)).toBe(true);
    if (QueryResult.isLoading(queryResult)) {
      expect(queryResult.skipped).toBe(true);
    }
    expect(useConvexQueryMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "skip",
    );
  });

  test("`skip` on a query with required args returns Loading with skipped true", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const queryResult = useQuery(queryWithError, "skip");

    expect(QueryResult.isLoading(queryResult)).toBe(true);
    if (QueryResult.isLoading(queryResult)) {
      expect(queryResult.skipped).toBe(true);
    }
    expect(useConvexQueryMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "skip",
    );
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

    const mutate = useMutation(mutationNoError);
    await expect(mutate({ text: "hi" })).resolves.toBe("note-1");
  });

  test("resolves to Either.Right with decoded result when error schema succeeds", async () => {
    const inner = vi.fn().mockResolvedValue(null);
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationWithError);
    const either = await mutate({ id: "abc" });

    expect(Either.isRight(either)).toBe(true);
    if (Either.isRight(either)) expect(either.right).toBeNull();
  });

  test("resolves to Either.Left with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationWithError);
    const either = await mutate({ id: "abc" });

    expect(Either.isLeft(either)).toBe(true);
    if (Either.isLeft(either)) {
      expect(either.left).toBeInstanceOf(NotFound);
      expect((either.left as NotFound).id).toBe("abc");
    }
  });

  test("rejects with the original error for a non-ConvexError", async () => {
    const transportError = new Error("network down");
    const inner = vi.fn().mockRejectedValue(transportError);
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationNoError);

    await expect(mutate({ text: "hi" })).rejects.toBe(transportError);
  });

  test("rejects with the original ConvexError for a ref without an error schema", async () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    const inner = vi.fn().mockRejectedValue(convexError);
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationNoError);

    await expect(mutate({ text: "hi" })).rejects.toBe(convexError);
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

    const run = useAction(actionNoError);
    await expect(run({})).resolves.toBe("pong");
  });

  test("resolves to Either.Right with decoded result when error schema succeeds", async () => {
    const inner = vi.fn().mockResolvedValue(null);
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionWithError);
    const either = await run({ id: "abc" });

    expect(Either.isRight(either)).toBe(true);
    if (Either.isRight(either)) expect(either.right).toBeNull();
  });

  test("resolves to Either.Left with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionWithError);
    const either = await run({ id: "abc" });

    expect(Either.isLeft(either)).toBe(true);
    if (Either.isLeft(either)) {
      expect(either.left).toBeInstanceOf(NotFound);
      expect((either.left as NotFound).id).toBe("abc");
    }
  });

  test("rejects with the original error for a non-ConvexError", async () => {
    const transportError = new Error("network down");
    const inner = vi.fn().mockRejectedValue(transportError);
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionNoError);

    await expect(run({})).rejects.toBe(transportError);
  });
});
