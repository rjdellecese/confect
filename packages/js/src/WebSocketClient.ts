import { ConvexClient } from "convex/browser";
import * as Context from "effect/Context";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

/**
 * A WebSocket request or subscription failure that could not be decoded as one
 * of the ref's declared errors. The client preserves the original failure in
 * `cause`.
 *
 * **Details**
 *
 * `reactiveQueryResult` emits this error inside a failed `Result`; one-shot
 * requests and `reactiveQuery` fail in their error channels. Argument encoding
 * and result decoding use `Schema.SchemaError` instead.
 *
 * @category Errors
 */
export class WebSocketClientError extends Schema.TaggedError<
  WebSocketClientError,
  {}
>()("WebSocketClientError", {
  /**
   * The original failure, encoded with Effect's defect schema when serialized.
   *
   * @category Errors
   */
  cause: Schema.Defect(),
}) {}

const runQuery = Effect.fn("WebSocketClient.query")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runMutation = Effect.fn("WebSocketClient.mutation")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runAction = Effect.fn("WebSocketClient.action")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) =>
  Effect.gen(function* () {
    const convexClient = yield* Effect.acquireRelease(
      Effect.sync(() => new ConvexClient(address, options)),
      (client) => Effect.promise(() => client.close()),
    );
    const setAuth = <R1 = never, R2 = never>(
      fetchToken: (args: {
        /**
         * Whether Convex needs a fresh token rather than a cached token.
         *
         * @category Authentication
         */
        forceRefreshToken: boolean;
      }) => Effect.Effect<string | null | undefined, never, R1>,
      onChange?: (isAuthenticated: boolean) => Effect.Effect<void, never, R2>,
    ): Effect.Effect<void, never, R1 | R2> =>
      Effect.gen(function* () {
        const context = yield* Effect.context<R1 | R2>();
        const runPromise = Effect.runPromiseWith(context);
        const runFork = Effect.runForkWith(context);
        convexClient.setAuth(
          (args) => runPromise(Effect.suspend(() => fetchToken(args))),
          ...(onChange !== undefined
            ? [
                (isAuthenticated: boolean) => {
                  runFork(Effect.suspend(() => onChange(isAuthenticated)));
                },
              ]
            : []),
        );
      });

    const mapUnknownError = (cause: unknown) =>
      WebSocketClientError.make({ cause });

    const query = <Query extends Ref.AnyPublicQuery>(
      ref: Query,
      ...rest: Ref.OptionalArgs<Query>
    ): Effect.Effect<
      Ref.Returns<Query>,
      Ref.Error<Query> | WebSocketClientError | Schema.SchemaError
    > => {
      const args = (rest[0] ?? {}) as Ref.Args<Query>;
      return runQuery(
        Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.query(functionReference, encodedArgs),
          mapUnknownError,
        ),
      );
    };

    const mutation = <Mutation extends Ref.AnyPublicMutation>(
      ref: Mutation,
      ...rest: Ref.OptionalArgs<Mutation>
    ): Effect.Effect<
      Ref.Returns<Mutation>,
      Ref.Error<Mutation> | WebSocketClientError | Schema.SchemaError
    > => {
      const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
      return runMutation(
        Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.mutation(functionReference, encodedArgs),
          mapUnknownError,
        ),
      );
    };

    const action = <Action extends Ref.AnyPublicAction>(
      ref: Action,
      ...rest: Ref.OptionalArgs<Action>
    ): Effect.Effect<
      Ref.Returns<Action>,
      Ref.Error<Action> | WebSocketClientError | Schema.SchemaError
    > => {
      const args = (rest[0] ?? {}) as Ref.Args<Action>;
      return runAction(
        Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.action(functionReference, encodedArgs),
          mapUnknownError,
        ),
      );
    };

    type ReactiveQueryError<Query extends Ref.AnyPublicQuery> =
      | Ref.Error<Query>
      | WebSocketClientError
      | Schema.SchemaError;

    const reactiveQueryResult = <Query extends Ref.AnyPublicQuery>(
      ref: Query,
      ...rest: Ref.OptionalArgs<Query>
    ): Stream.Stream<
      Result.Result<Ref.Returns<Query>, ReactiveQueryError<Query>>
    > => {
      type QueryResult = Result.Result<
        Ref.Returns<Query>,
        ReactiveQueryError<Query>
      >;
      const args = (rest[0] ?? {}) as Ref.Args<Query>;
      const functionReference = Ref.getFunctionReference(ref);
      const onError = Ref.decodeErrorOrElse(ref, mapUnknownError);

      return Stream.unwrap(
        Effect.match(Ref.encodeArgs(ref, args), {
          onFailure: (error) =>
            pipe(error, Result.fail, Stream.succeed<QueryResult>),
          onSuccess: (encodedArgs) =>
            Stream.callback<Result.Result<unknown, ReactiveQueryError<Query>>>(
              (queue) =>
                Effect.gen(function* () {
                  const unsubscribe = convexClient.onUpdate(
                    functionReference,
                    encodedArgs,
                    (result) => {
                      Queue.offerUnsafe(queue, Result.succeed(result));
                    },
                    (error) => {
                      Queue.offerUnsafe(queue, Result.fail(onError(error)));
                    },
                  );
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => unsubscribe()),
                  );
                }),
            ),
        }),
      ).pipe(
        Stream.mapEffect((result): Effect.Effect<QueryResult> =>
          Result.match(result, {
            onFailure: (error) => Effect.succeed(Result.fail(error)),
            onSuccess: (encodedReturns) =>
              Ref.decodeReturns(ref, encodedReturns).pipe(Effect.result),
          }),
        ),
      );
    };

    const reactiveQuery = <Query extends Ref.AnyPublicQuery>(
      ref: Query,
      ...rest: Ref.OptionalArgs<Query>
    ): Stream.Stream<Ref.Returns<Query>, ReactiveQueryError<Query>> =>
      reactiveQueryResult(ref, ...rest).pipe(
        Stream.mapEffect(
          Result.match({
            onFailure: Effect.fail,
            onSuccess: Effect.succeed,
          }),
        ),
      );

    return {
      /**
       * The deployment address passed to the layer.
       *
       * @category Getters
       */
      url: address,
      /**
       * Installs an Effect-based token provider and optional
       * authentication-change callback on the shared client.
       *
       * **Details**
       *
       * Running this Effect captures the services that the callbacks need
       * later. Installation does not wait for Convex to accept the token.
       *
       * **Gotchas**
       *
       * All callers using this client share the registration. Provide separate
       * client instances for independent sessions.
       *
       * @category Authentication
       *
       * @param fetchToken - Called when Convex needs a token. Honor
       *   `forceRefreshToken` by bypassing a cached token; return `null` or
       *   `undefined` when no token is available. The Effect must not have
       *   typed failures; handle recoverable token-fetch failures inside it.
       * @param onChange - Optional callback receiving whether Convex accepted
       *   authentication. Runs in a forked Effect using the captured services;
       *   it must not have typed failures either.
       *
       * @returns An Effect requiring both callbacks' services that installs the
       *   callbacks without a typed failure.
       */
      setAuth,
      /**
       * Runs a public query once; use `reactiveQuery` to observe later updates.
       *
       * @category Running
       *
       * @param ref - The public query ref.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns An Effect of the decoded result. Failures are the ref's typed
       *   error, `WebSocketClientError` for other request failures, or
       *   `Schema.SchemaError` for argument/result codec failures.
       */
      query,
      /**
       * Runs a public mutation, encoding its arguments and decoding its result.
       *
       * @category Running
       *
       * @param ref - The public mutation ref.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns An Effect of the decoded result, failing with the ref's typed
       *   error, `WebSocketClientError` for other request failures, or
       *   `Schema.SchemaError` for argument/result codec failures.
       */
      mutation,
      /**
       * Runs a public action, encoding its arguments and decoding its result.
       *
       * @category Running
       *
       * @param ref - The public action ref.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns An Effect of the decoded result, failing with the ref's typed
       *   error, `WebSocketClientError` for other request failures, or
       *   `Schema.SchemaError` for argument/result codec failures.
       */
      action,
      /**
       * Subscribes to decoded query updates and fails the stream on the first
       * query or codec error.
       *
       * **Details**
       *
       * Each consumption opens its own listener and releases it when the stream
       * ends or is interrupted. Consume the stream while the client layer is in
       * scope.
       *
       * @category Subscriptions
       *
       * @param ref - The public query ref to observe.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns A stream that terminates on the ref's typed error,
       *   `WebSocketClientError`, or an argument/result `Schema.SchemaError`.
       *   Use `reactiveQueryResult` to keep listening after a query failure.
       */
      reactiveQuery,
      /**
       * Subscribes to query updates as `Result` values so a later success can
       * follow a query or decoding failure.
       *
       * **Details**
       *
       * Each consumption owns a listener that stays open after failed updates
       * and is removed when the stream ends or is interrupted. Keep the client
       * layer in scope while consuming it.
       *
       * **Gotchas**
       *
       * An argument encoding failure emits one failed `Result` and completes
       * without subscribing.
       *
       * @category Subscriptions
       *
       * @param ref - The public query ref to observe.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns A stream with no typed error channel. Each element is a
       *   `Result` containing a decoded value, the ref's typed error,
       *   `WebSocketClientError`, or `Schema.SchemaError`.
       */
      reactiveQueryResult,
    };
  });

/**
 * Service tag for one-shot function calls and reactive queries over a shared
 * WebSocket connection. Provide {@link layer} to use Confect refs with
 * [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 *
 * @category Tags
 */
export const WebSocketClient =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<Effect.Success<ReturnType<typeof make>>>(
    "@confect/js/WebSocketClient",
  );

/**
 * Service requirement for Effects that use {@link WebSocketClient}; {@link layer}
 * supplies the client.
 *
 * @category Services
 */
export type WebSocketClient = typeof WebSocketClient.Identifier;

/**
 * Creates a layer that constructs a WebSocket client when built and closes it
 * when the layer's scope ends.
 *
 * **Gotchas**
 *
 * Consume reactive query streams inside that scope. Exceptions from opening or
 * closing the connection are defects rather than `WebSocketClientError`
 * failures.
 *
 * **Example** (Reading the address of a scoped WebSocket client)
 *
 * ```ts
 * import { WebSocketClient } from "@confect/js";
 * import * as Effect from "effect/Effect";
 *
 * const deploymentUrl = Effect.gen(function* () {
 *   const client = yield* WebSocketClient.WebSocketClient;
 *   return client.url;
 * }).pipe(
 *   Effect.provide(WebSocketClient.layer("https://example.convex.cloud")),
 * );
 * ```
 *
 * @category Layers
 *
 * @param address - The Convex deployment URL, such as
 *   `https://example.convex.cloud`.
 * @param options - Options forwarded to Convex's `ConvexClient` constructor.
 *
 * @returns A layer providing {@link WebSocketClient} for the lifetime of the
 *   connection.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.effect(WebSocketClient, make(address, options));
