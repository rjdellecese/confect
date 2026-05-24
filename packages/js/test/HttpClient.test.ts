import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, layer } from "@effect/vitest";
import { ConvexError } from "convex/values";
import { Effect, Either, Schema } from "effect";
import { beforeEach, vi } from "vitest";
import * as HttpClient from "../src/HttpClient";

const mockQuery = vi.fn().mockResolvedValue({});
const mockMutation = vi.fn().mockResolvedValue({});
const mockAction = vi.fn().mockResolvedValue({});

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({});
  mockMutation.mockReset().mockResolvedValue({});
  mockAction.mockReset().mockResolvedValue({});
});

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    url = "https://test.convex.cloud";
    setAuth() {}
    clearAuth() {}
    query = mockQuery;
    mutation = mockMutation;
    action = mockAction;
  },
}));

const noArgsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

const noArgsMutationRef = Ref.make(
  "tasks",
  FunctionSpec.publicMutation({
    name: "cleanup",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: Schema.Struct({ text: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

const noArgsActionRef = Ref.make(
  "random",
  FunctionSpec.publicAction({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: Schema.Struct({ to: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

const HttpClientLayer = HttpClient.layer("https://test.convex.cloud");

layer(HttpClientLayer)("HttpClient optional args", (it) => {
  describe("query", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.query(noArgsQueryRef);
        expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {});
      }),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.query(argsQueryRef, { id: "abc" });
        expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {
          id: "abc",
        });
      }),
    );
  });

  describe("mutation", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.mutation(noArgsMutationRef);
        expect(mockMutation).toHaveBeenCalledWith(expect.anything(), {});
      }),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.mutation(argsMutationRef, { text: "hello" });
        expect(mockMutation).toHaveBeenCalledWith(expect.anything(), {
          text: "hello",
        });
      }),
    );
  });

  describe("action", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.action(noArgsActionRef);
        expect(mockAction).toHaveBeenCalledWith(expect.anything(), {});
      }),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.action(argsActionRef, { to: "user@example.com" });
        expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
          to: "user@example.com",
        });
      }),
    );
  });
});

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

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NotFound,
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

layer(HttpClientLayer)("HttpClient error decoding", (it) => {
  describe("query", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockQuery.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.query(queryWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        assert(result.left instanceof NotFound);
        expect(result.left.id).toBe("abc");
      }),
    );

    it.effect("wraps a non-ConvexError as HttpClientError", () =>
      Effect.gen(function* () {
        const transport = new Error("network down");
        mockQuery.mockRejectedValue(transport);
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.query(queryWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        assert(result.left instanceof HttpClient.HttpClientError);
        expect(result.left.cause).toBe(transport);
      }),
    );
  });

  describe("mutation", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockMutation.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.mutation(mutationWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        expect(result.left).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("wraps a non-ConvexError as HttpClientError", () =>
      Effect.gen(function* () {
        mockMutation.mockRejectedValue(new Error("oops"));
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.mutation(mutationWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        expect(result.left).toBeInstanceOf(HttpClient.HttpClientError);
      }),
    );
  });

  describe("action", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockAction.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.action(actionWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        expect(result.left).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("wraps a non-ConvexError as HttpClientError", () =>
      Effect.gen(function* () {
        mockAction.mockRejectedValue(new Error("oops"));
        const client = yield* HttpClient.HttpClient;

        const result = yield* Effect.either(
          client.action(actionWithError, { id: "abc" }),
        );
        assert(Either.isLeft(result));
        expect(result.left).toBeInstanceOf(HttpClient.HttpClientError);
      }),
    );
  });
});
