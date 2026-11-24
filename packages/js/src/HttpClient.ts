import * as Ref from "@confect/core/Ref";
import { ConvexHttpClient } from "convex/browser";
import type { HttpMutationOptions } from "convex/browser";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

/**
 * An HTTP request failure that could not be decoded as one of the ref's
 * declared errors. Handle it with `Effect.catchTag("HttpClientError", ...)` and
 * inspect `cause` for the original rejection.
 *
 * **Details**
 *
 * A matching declared error appears directly in the Effect's error channel.
 * Argument encoding and result decoding failures use `Schema.SchemaError`
 * instead.
 *
 * @category Errors
 */
export class HttpClientError extends Schema.TaggedError<
  HttpClientError,
  unknown
>()("HttpClientError", {
  /**
   * The original rejected value, including undeclared Convex errors.
   *
   * @category Errors
   */
  cause: Schema.Unknown,
}) {}

const runQuery = Effect.fn("HttpClient.query")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runMutation = Effect.fn("HttpClient.mutation")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runAction = Effect.fn("HttpClient.action")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const mapUnknownError = (cause: unknown) => HttpClientError.make({ cause });

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

  const query = <Query extends Ref.AnyPublicQuery>(
    ref: Query,
    ...rest: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | HttpClientError | Schema.SchemaError
  > => {
    const args = Ref.argsOrEmpty<Query>(rest);
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
    const args = Ref.argsOrEmpty<Mutation>(rest);
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
    const args = Ref.argsOrEmpty<Action>(rest);
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
     * Sets the JWT for subsequent requests when the returned Effect runs.
     *
     * **Gotchas**
     *
     * All callers using this client share the token. Provide separate client
     * instances for independent sessions.
     *
     * @category Authentication
     *
     * @param token - The authentication token to send to Convex.
     *
     * @returns An Effect with no typed failure that updates the client locally.
     */
    setAuth,
    /**
     * Effect that clears the client's shared token so subsequent requests are
     * unauthenticated. It has no typed failure.
     *
     * **Gotchas**
     *
     * Yield the Effect itself (`yield* client.clearAuth`); this property is not
     * a method.
     *
     * @category Authentication
     */
    clearAuth,
    /**
     * Runs a public query once, encoding its arguments and decoding its result.
     *
     * @category Running
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
     * Runs a public mutation with decoded arguments and queues it behind
     * earlier mutations on the same HTTP client by default.
     *
     * **Gotchas**
     *
     * To bypass the queue for one call, pass `{ skipQueue: true }` after the
     * arguments. For an argument-free mutation, pass `{}` or `undefined` before
     * the options.
     *
     * @category Running
     *
     * @param ref - The public mutation ref.
     * @param rest - Decoded arguments followed by optional Convex
     *   `HttpMutationOptions`.
     *
     * @returns An Effect of the decoded result, failing with the ref's typed
     *   error, `HttpClientError` for other request failures, or
     *   `Schema.SchemaError` for argument/result codec failures.
     */
    mutation,
    /**
     * Runs a public action, encoding its arguments and decoding its result.
     *
     * @category Running
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
 * Service tag for one-shot queries, mutations, and actions over HTTP. Provide
 * {@link layer} to use Confect refs with
 * [ConvexHttpClient](https://docs.convex.dev/api/classes/browser.ConvexHttpClient)
 * in a runtime that supports `fetch`.
 *
 * @category Tags
 */
export const HttpClient =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/js/HttpClient");

/**
 * Service requirement for Effects that use {@link HttpClient}; {@link layer}
 * supplies the client.
 *
 * @category Services
 */
export type HttpClient = typeof HttpClient.Identifier;

/**
 * Creates a layer that provides an HTTP client with its own authentication
 * state and mutation queue.
 *
 * **Details**
 *
 * Building the layer constructs the client; declaring the layer makes no
 * request and opens no WebSocket connection.
 *
 * **Gotchas**
 *
 * A constructor exception is a defect, not an `HttpClientError`.
 *
 * **Example** (Providing an HTTP client to read its deployment URL)
 *
 * ```ts
 * import { HttpClient } from "@confect/js";
 * import * as Effect from "effect/Effect";
 *
 * const deploymentUrl = Effect.gen(function* () {
 *   const client = yield* HttpClient.HttpClient;
 *   return client.url;
 * }).pipe(
 *   Effect.provide(HttpClient.layer("https://example.convex.cloud")),
 * );
 * ```
 *
 * @category Layers
 *
 * @param address - The Convex deployment URL, such as
 *   `https://example.convex.cloud`.
 * @param options - Options forwarded to Convex's `ConvexHttpClient`
 *   constructor.
 *
 * @returns A layer providing {@link HttpClient} without a connection finalizer.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => Layer.sync(HttpClient, () => make(address, options));
