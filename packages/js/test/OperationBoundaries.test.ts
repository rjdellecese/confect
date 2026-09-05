import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import { ConvexError } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import { vi } from "vitest";
import * as HttpClient from "../src/internal/HttpClient";
import * as WebSocketClient from "../src/internal/WebSocketClient";

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const definition = {
  name: "get",
  args: () => ({ id: Schema.String }),
  returns: () => Schema.String,
  error: () => NotFound,
};

const queryRef = Ref.make("notes", FunctionSpec.publicQuery(definition));
const mutationRef = Ref.make("notes", FunctionSpec.publicMutation(definition));
const actionRef = Ref.make("notes", FunctionSpec.publicAction(definition));

type Client =
  | ReturnType<typeof HttpClient.make>
  | ReturnType<typeof WebSocketClient.make>;

const operations: ReadonlyArray<{
  readonly name: string;
  readonly run: (
    client: Client,
  ) => Effect.Effect<
    string,
    | NotFound
    | Schema.SchemaError
    | HttpClient.HttpClientError
    | WebSocketClient.WebSocketClientError
  >;
}> = [
  {
    name: "query",
    run: (client: Client) => client.query(queryRef, { id: "abc" }),
  },
  {
    name: "mutation",
    run: (client: Client) => client.mutation(mutationRef, { id: "abc" }),
  },
  {
    name: "action",
    run: (client: Client) => client.action(actionRef, { id: "abc" }),
  },
];

const clients = [
  {
    name: "HttpClient",
    make: (invoke: (args: unknown) => Promise<unknown>) =>
      HttpClient.make({
        url: "https://test.convex.cloud",
        setAuth: () => {},
        clearAuth: () => {},
        query: (_, args) => invoke(args),
        mutation: (_, args) => invoke(args),
        action: (_, args) => invoke(args),
      }),
  },
  {
    name: "WebSocketClient",
    make: (invoke: (args: unknown) => Promise<unknown>) =>
      WebSocketClient.make("https://test.convex.cloud", {
        setAuth: () => {},
        close: () => Promise.resolve(),
        query: (_, args) => invoke(args),
        mutation: (_, args) => invoke(args),
        action: (_, args) => invoke(args),
        onUpdate: () => () => {},
      }),
  },
];

describe.each(clients)("$name operation boundaries", ({ name, make }) => {
  for (const operation of operations) {
    it.effect(
      `${operation.name} stays lazy and creates one child span per execution`,
      () =>
        Effect.gen(function* () {
          const invoke = vi.fn(() => Promise.resolve("found"));
          const tracer = yield* Tracer.Tracer;
          const span = vi.fn(tracer.span.bind(tracer));
          const client = make(invoke);
          const effect = operation.run(client);

          expect(invoke).not.toHaveBeenCalled();
          expect(span).not.toHaveBeenCalled();

          const results = yield* Effect.all([effect, effect]).pipe(
            Effect.withSpan("caller"),
            Effect.withTracer(Tracer.make({ span })),
          );

          expect(results).toEqual(["found", "found"]);
          expect(invoke).toHaveBeenCalledTimes(2);
          expect(span.mock.calls.map(([options]) => options.name)).toEqual([
            "caller",
            `${name}.${operation.name}`,
            `${name}.${operation.name}`,
          ]);

          const [parent, ...children] = span.mock.results.map(
            (result) => result.value,
          );
          for (const child of children) {
            expect(Option.getOrThrow(child.parent)).toBe(parent);
            expect(child.traceId).toBe(parent.traceId);
            expect(child.status._tag).toBe("Ended");
            assert(child.status._tag === "Ended");
            expect(Exit.isSuccess(child.status.exit)).toBe(true);
          }
          expect(children[0]).not.toBe(children[1]);
        }),
    );

    it.effect(
      `${operation.name} preserves typed errors and ends its span with failure`,
      () =>
        Effect.gen(function* () {
          const tracer = yield* Tracer.Tracer;
          const span = vi.fn(tracer.span.bind(tracer));
          const client = make(() =>
            Promise.reject(new ConvexError({ _tag: "NotFound", id: "abc" })),
          );
          const result = yield* operation
            .run(client)
            .pipe(
              Effect.result,
              Effect.withSpan("caller"),
              Effect.withTracer(Tracer.make({ span })),
            );

          assert(Result.isFailure(result));
          expect(result.failure).toEqual(new NotFound({ id: "abc" }));
          expect(span.mock.calls.map(([options]) => options.name)).toEqual([
            "caller",
            `${name}.${operation.name}`,
          ]);
          const child = span.mock.results[1]?.value;
          assert(child !== undefined);
          assert(child.status._tag === "Ended");
          assert(Exit.isFailure(child.status.exit));
          expect(
            Option.getOrThrow(Cause.findErrorOption(child.status.exit.cause)),
          ).toBe(result.failure);
        }),
    );
  }

  it.effect(
    "normalizes omitted args once when constructing the operation",
    () =>
      Effect.gen(function* () {
        const ref = Ref.make(
          "notes",
          FunctionSpec.convexPublicQuery<
            RegisteredQuery<"public", Record<string, never>, string>
          >()("list"),
        );
        const invoke = vi.fn((_args: unknown) => Promise.resolve("found"));
        const client = make(invoke);
        const effect = client.query(ref);

        expect(invoke).not.toHaveBeenCalled();
        yield* effect;
        yield* effect;
        expect(invoke.mock.calls[0]?.[0]).toEqual({});
        expect(invoke.mock.calls[0]?.[0]).toBe(invoke.mock.calls[1]?.[0]);

        yield* client.query(ref);
        expect(invoke.mock.calls[2]?.[0]).not.toBe(invoke.mock.calls[0]?.[0]);
      }),
  );
});
