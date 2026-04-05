import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { vi } from "vitest";
import * as HttpClient from "../src/HttpClient";

const mockQuery = vi.fn().mockResolvedValue({});
const mockMutation = vi.fn().mockResolvedValue({});
const mockAction = vi.fn().mockResolvedValue({});

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

const layer = HttpClient.layer("https://test.convex.cloud");

describe("HttpClient optional args", () => {
  describe("query", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.query(noArgsQueryRef);
        expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {});
      }).pipe(Effect.provide(layer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.query(argsQueryRef, { id: "abc" });
        expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {
          id: "abc",
        });
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("mutation", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.mutation(noArgsMutationRef);
        expect(mockMutation).toHaveBeenCalledWith(expect.anything(), {});
      }).pipe(Effect.provide(layer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.mutation(argsMutationRef, { text: "hello" });
        expect(mockMutation).toHaveBeenCalledWith(expect.anything(), {
          text: "hello",
        });
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("action", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.action(noArgsActionRef);
        expect(mockAction).toHaveBeenCalledWith(expect.anything(), {});
      }).pipe(Effect.provide(layer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.action(argsActionRef, { to: "user@example.com" });
        expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
          to: "user@example.com",
        });
      }).pipe(Effect.provide(layer)),
    );
  });
});
