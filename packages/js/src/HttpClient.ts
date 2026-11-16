import * as Ref from "@confect/core/Ref";
import { ConvexHttpClient, type HttpMutationOptions } from "convex/browser";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

/**
 * A transport or backend failure that could not be decoded as the ref's typed
 * error. Recover with `Effect.catchTag("HttpClientError", ...)`; schema
 * failures from encoding arguments or decoding results use `Schema.SchemaError`
 * instead.
 *
 * @category Errors
 */
export class HttpClientError extends Schema.TaggedError<HttpClientError, {}>()(
  "HttpClientError",
  {
    /**
     * The original rejected value, including undeclared Convex errors.
     *
     * @category Errors
     */
    cause: Schema.Unknown,
  },
) {}

const runQuery = Effect.fn("HttpClient.query")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runMutation = Effect.fn("HttpClient.mutation")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runAction = Effect.fn("HttpClient.action")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => {
  const client = new ConvexHttpClient(address, options);
  const setAuth = (token: string) =>
    Effect.sync(() => {
      client.setAuth(token);
    });

  const clearAuth = Effect.sync(() => {
    client.clearAuth();
  });

  const mapUnknownError = (cause: unknown) => HttpClientError.make({ cause });

  const query = <Query extends Ref.AnyPublicQuery>(
    ref: Query,
    ...rest: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Query>;
    return runQuery(
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          client.query(functionReference, encodedArgs),
        mapUnknownError,
      ),
    );
  };

  const mutation = <Mutation extends Ref.AnyPublicMutation>(
    ref: Mutation,
    ...rest: [...Ref.OptionalArgs<Mutation>, options?: HttpMutationOptions]
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
    const mutationOptions: HttpMutationOptions = rest[1] ?? {
      skipQueue: false,
    };
    return runMutation(
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          client.mutation(functionReference, encodedArgs, mutationOptions),
        mapUnknownError,
      ),
    );
  };

  const action = <Action extends Ref.AnyPublicAction>(
    ref: Action,
    ...rest: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    Ref.Returns<Action>,
    Ref.Error<Action> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Action>;
    return runAction(
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          client.action(functionReference, encodedArgs),
        mapUnknownError,
      ),
    );
  };

  return {
    /**
     * The deployment URL used by the underlying Convex HTTP client.
     *
     * @category Getters
     */
    url: client.url,
    /**
     * Sets the JWT used by subsequent requests when the returned Effect runs.
     * The token is shared by all users of this service instance; use separate
     * layers for callers that must not share authentication state.
     *
     * @category Authentication
     *
     * @param token - The authentication token to send to Convex.
     *
     * @returns An Effect with no typed failure that updates the client locally.
     */
    setAuth,
    /**
     * Clears the shared authentication token when this Effect runs. Yield the
     * Effect itself (`yield* client.clearAuth`), rather than calling a method.
     * Subsequent requests are unauthenticated; there is no typed failure.
     *
     * @category Authentication
     */
    clearAuth,
    /**
     * Runs a public query once, encoding its arguments and decoding its result.
     *
     * @category Invocation
     *
     * @param ref - The public query ref, usually from generated `refs`.
     * @param rest - Decoded arguments; omit them only for an argument-free ref.
     *
     * @returns An Effect of the decoded result. Failures are the ref's typed
     *   error, `HttpClientError` for other request failures, or
     *   `Schema.SchemaError` for argument/result codec failures.
     */
    query,
    /**
     * Runs a public mutation with decoded arguments. Mutations are queued by
     * default on this HTTP client.
     *
     * @category Invocation
     *
     * @param ref - The public mutation ref.
     * @param rest - Decoded arguments followed by Convex `HttpMutationOptions`.
     *   To pass options for an argument-free mutation, pass `{}` first. Set
     *   `skipQueue: true` to bypass the client's mutation queue.
     *
     * @returns An Effect of the decoded result, failing with the ref's typed
     *   error, `HttpClientError` for other request failures, or
     *   `Schema.SchemaError` for argument/result codec failures.
     */
    mutation,
    /**
     * Runs a public action, encoding its arguments and decoding its result.
     *
     * @category Invocation
     *
     * @param ref - The public action ref.
     * @param rest - Decoded arguments; omit them only for an argument-free ref.
     *
     * @returns An Effect of the decoded result, failing with the ref's typed
     *   error, `HttpClientError` for other request failures, or
     *   `Schema.SchemaError` for argument/result codec failures.
     */
    action,
  };
};

/**
 * A Confect client which uses HTTP to communicate with your Convex backend.
 * Works in any JS runtime that supports `fetch`. Wraps
 * [ConvexHttpClient](https://docs.convex.dev/api/classes/browser.ConvexHttpClient).
 *
 * @category Services
 */
export const HttpClient =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/js/HttpClient");

/**
 * The Effect requirement supplied by {@link layer} and accessed with
 * {@link HttpClient}.
 *
 * @category Services
 */
export type HttpClient = typeof HttpClient.Identifier;

/**
 * Provides an HTTP client service with its own authentication state and
 * mutation queue. Construction happens when the layer is built, not when it is
 * declared.
 *
 * @category Layers
 *
 * @example
 *   import { HttpClient } from "@confect/js";
 *   import * as Effect from "effect/Effect";
 *
 *   const deploymentUrl = Effect.gen(function* () {
 *     const client = yield* HttpClient.HttpClient;
 *     return client.url;
 *   }).pipe(Effect.provide(HttpClient.layer("https://example.convex.cloud")));
 *
 * @param address - The Convex deployment URL, such as
 *   `https://example.convex.cloud`.
 * @param options - Options forwarded to Convex's `ConvexHttpClient`
 *   constructor.
 *
 * @returns A layer providing {@link HttpClient}. Constructor exceptions are
 *   defects, not `HttpClientError` failures. No WebSocket or close finalizer is
 *   used.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => Layer.sync(HttpClient, () => make(address, options));
