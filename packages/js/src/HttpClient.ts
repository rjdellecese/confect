import * as Ref from "@confect/core/Ref";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

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

  const clearAuth = Effect.sync(() => {
    client.clearAuth();
  });

  const query = <Query extends Ref.AnyPublicQuery>(
    ref: Query,
    ...rest: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    HttpClientError | ParseResult.ParseError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Query>;
    return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
      Effect.tryPromise({
        try: () =>
          client.query(
            functionReference,
            encodedArgs as Ref.EncodedArgs<Query>,
          ),
        catch: (cause) => new HttpClientError({ cause }),
      }),
    );
  };

  const mutation = <Mutation extends Ref.AnyPublicMutation>(
    ref: Mutation,
    ...rest: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    HttpClientError | ParseResult.ParseError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
    return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
      Effect.tryPromise({
        try: () =>
          client.mutation(
            functionReference as FunctionReference<
              "mutation",
              "public",
              any,
              unknown
            >,
            encodedArgs as Ref.EncodedArgs<Mutation> & Value,
          ),
        catch: (cause) => new HttpClientError({ cause }),
      }),
    );
  };

  const action = <Action extends Ref.AnyPublicAction>(
    ref: Action,
    ...rest: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    Ref.Returns<Action>,
    HttpClientError | ParseResult.ParseError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Action>;
    return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
      Effect.tryPromise({
        try: () =>
          client.action(
            functionReference as FunctionReference<
              "action",
              "public",
              any,
              unknown
            >,
            encodedArgs as Ref.EncodedArgs<Action> & Value,
          ),
        catch: (cause) => new HttpClientError({ cause }),
      }),
    );
  };

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
  "@confect/js/HttpClient",
);

export type HttpClient = typeof HttpClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => Layer.sync(HttpClient, () => make(address, options));
