import * as Ref from "@confect/core/Ref";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema } from "effect";

export class HttpClientError extends Schema.TaggedError<HttpClientError>()(
  "HttpClientError",
  {
    cause: Schema.Unknown,
  },
) {}

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => {
  const client = new ConvexHttpClient(address, options);

  const url = client.url;

  const setAuth = (token: string) =>
    Effect.sync(() => {
      client.setAuth(token);
    });

  const clearAuth = () =>
    Effect.sync(() => {
      client.clearAuth();
    });

  const query = <Query extends Ref.AnyQuery>(
    ref: Query,
    args: Ref.Args<Query>,
  ): Effect.Effect<
    Ref.Returns<Query>,
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(ref);
      const functionName = Ref.getConvexFunctionName(
        ref,
      ) as unknown as FunctionReference<"query">;

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );

            const encodedResult = yield* Effect.tryPromise({
              try: () => client.query(functionName, encodedArgs),
              catch: (cause) => new HttpClientError({ cause }),
            });

            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedResult,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.tryPromise({
            try: () => client.query(functionName, args),
            catch: (cause) => new HttpClientError({ cause }),
          }),
        ),
        Match.exhaustive,
      );
    });

  const mutation = <Mutation extends Ref.AnyMutation>(
    ref: Mutation,
    args: Ref.Args<Mutation>,
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(ref);
      const functionName = Ref.getConvexFunctionName(
        ref,
      ) as unknown as FunctionReference<"mutation">;

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );

            const encodedResult = yield* Effect.tryPromise({
              try: () => client.mutation(functionName, encodedArgs),
              catch: (cause) => new HttpClientError({ cause }),
            });

            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedResult,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.tryPromise({
            try: () => client.mutation(functionName, args),
            catch: (cause) => new HttpClientError({ cause }),
          }),
        ),
        Match.exhaustive,
      );
    });

  const action = <Action extends Ref.AnyAction>(
    ref: Action,
    args: Ref.Args<Action>,
  ): Effect.Effect<
    Ref.Returns<Action>,
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(ref);
      const functionName = Ref.getConvexFunctionName(
        ref,
      ) as unknown as FunctionReference<"action">;

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );

            const encodedResult = yield* Effect.tryPromise({
              try: () => client.action(functionName, encodedArgs),
              catch: (cause) => new HttpClientError({ cause }),
            });

            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedResult,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.tryPromise({
            try: () => client.action(functionName, args),
            catch: (cause) => new HttpClientError({ cause }),
          }),
        ),
        Match.exhaustive,
      );
    });

  return {
    url,
    setAuth,
    clearAuth,
    query,
    mutation,
    action,
  };
};

/**
 * A Confect client which uses HTTP to communicate with your Convex backend. Works in any JS runtime that supports `fetch`. Wraps [ConvexHttpClient](https://docs.convex.dev/api/classes/browser.ConvexHttpClient).
 */
export const HttpClient = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/HttpClient",
);

export type HttpClient = typeof HttpClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => Layer.sync(HttpClient, () => make(address, options));
