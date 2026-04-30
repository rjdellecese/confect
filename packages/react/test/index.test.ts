import { FunctionSpec, Ref } from "@confect/core";
import { ConvexError } from "convex/values";
import { Cause, Option, Schema } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();
const useConvexActionMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useMutation: (...args: unknown[]) => useConvexMutationMock(...args),
  useAction: (...args: unknown[]) => useConvexActionMock(...args),
}));

const { Result, useAction, useMutation, useQuery } =
  await import("../src/index");

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
  test("returns Initial when convex returns undefined", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const result = useQuery(queryNoError, {});

    expect(Result.isInitial(result)).toBe(true);
  });

  test("returns Success with decoded value", () => {
    useConvexQueryMock.mockReturnValue([{ text: "hello" }]);

    const result = useQuery(queryNoError, {});

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.value).toEqual([{ text: "hello" }]);
    }
  });

  test("Failure carries Cause.fail with the decoded typed error for a matching ConvexError", () => {
    useConvexQueryMock.mockImplementation(() => {
      throw new ConvexError({ _tag: "NotFound", id: "abc" });
    });

    const result = useQuery(queryWithError, { id: "abc" });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      const failure = Option.getOrThrow(Cause.failureOption(result.cause));
      expect(failure).toBeInstanceOf(NotFound);
      expect(failure.id).toBe("abc");
      expect(Option.isNone(Cause.dieOption(result.cause))).toBe(true);
    }
  });

  test("Failure carries Cause.die for a non-ConvexError", () => {
    const transportError = new Error("network down");
    useConvexQueryMock.mockImplementation(() => {
      throw transportError;
    });

    const result = useQuery(queryWithError, { id: "abc" });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(Option.isNone(Cause.failureOption(result.cause))).toBe(true);
      expect(Option.getOrThrow(Cause.dieOption(result.cause))).toBe(
        transportError,
      );
    }
  });

  test("Failure carries Cause.die when a ConvexError is thrown from a ref without an error schema", () => {
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });
    useConvexQueryMock.mockImplementation(() => {
      throw convexError;
    });

    const result = useQuery(queryNoError, {});

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(Option.isNone(Cause.failureOption(result.cause))).toBe(true);
      expect(Option.getOrThrow(Cause.dieOption(result.cause))).toBe(
        convexError,
      );
    }
  });

  test("forwards `skip` to the underlying convex hook", () => {
    useConvexQueryMock.mockReturnValue(undefined);

    const result = useQuery(queryNoError, "skip");

    expect(Result.isInitial(result)).toBe(true);
    expect(useConvexQueryMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "skip",
    );
  });
});

describe("useMutation", () => {
  test("resolves with the decoded result", async () => {
    const inner = vi.fn().mockResolvedValue("note-1");
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationNoError);
    await expect(mutate({ text: "hi" })).resolves.toBe("note-1");
  });

  test("rejects with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexMutationMock.mockReturnValue(inner);

    const mutate = useMutation(mutationWithError);

    await expect(mutate({ id: "abc" })).rejects.toMatchObject({
      _tag: "NotFound",
      id: "abc",
    });
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
  test("resolves with the decoded result", async () => {
    const inner = vi.fn().mockResolvedValue("pong");
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionNoError);
    await expect(run({})).resolves.toBe("pong");
  });

  test("rejects with the decoded typed error for a matching ConvexError", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new ConvexError({ _tag: "NotFound", id: "abc" }));
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionWithError);

    await expect(run({ id: "abc" })).rejects.toMatchObject({
      _tag: "NotFound",
      id: "abc",
    });
  });

  test("rejects with the original error for a non-ConvexError", async () => {
    const transportError = new Error("network down");
    const inner = vi.fn().mockRejectedValue(transportError);
    useConvexActionMock.mockReturnValue(inner);

    const run = useAction(actionNoError);

    await expect(run({})).rejects.toBe(transportError);
  });
});
