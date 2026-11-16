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
 * A transport or backend failure that could not be decoded as the ref's typed
 * error. Appears in request/stream error channels, or inside a failed `Result`
 * from `reactiveQueryResult`. Argument/result codec failures instead use
 * `Schema.SchemaError`.
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
       * Installs an Effect-based token provider on this shared client instance.
       * Captures the calling Effect's services for later callback invocations.
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
       * @returns An Effect requiring both callbacks' services. It installs the
       *   callbacks, without waiting for authentication to finish, and has no
       *   typed failure. Use separate layers for independent auth sessions.
       */
      setAuth,
      /**
       * Runs a public query once; use `reactiveQuery` to observe later updates.
       *
       * @category Invocation
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
       * @category Invocation
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
       * @category Invocation
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
       * Subscribes to decoded query results when the stream is consumed. Each
       * consumption registers its own listener and removes it when the stream
       * ends or is interrupted; keep the client layer alive while consuming
       * it.
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
       * Subscribes with query failures represented as events rather than stream
       * failures. A later successful update can recover after a failed event.
       * Each consumption owns a listener, removed on completion/interruption.
       *
       * @category Subscriptions
       *
       * @param ref - The public query ref to observe.
       * @param rest - Decoded arguments; omit them only for an argument-free
       *   ref.
       *
       * @returns A stream of `Result` values containing decoded results or the
       *   ref's typed error, `WebSocketClientError`, or `Schema.SchemaError`.
       *   Argument encoding failure emits one failed `Result` and completes
       *   without opening a listener. Query/result decoding failures leave an
       *   existing listener open. The stream has no typed error channel; keep
       *   the client layer alive while consuming it.
       */
      reactiveQueryResult,
    };
  });

/**
 * A Confect client which uses a WebSocket to communicate with your Convex
 * backend and supports reactive query subscriptions. The WebSocket connection
 * is managed by the layer's scope and closed automatically when the scope ends.
 * Wraps
 * [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 *
 * @category Services
 */
export const WebSocketClient =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<Effect.Success<ReturnType<typeof make>>>(
    "@confect/js/WebSocketClient",
  );

/**
 * The Effect requirement supplied by {@link layer} and accessed with
 * {@link WebSocketClient}.
 *
 * @category Services
 */
export type WebSocketClient = typeof WebSocketClient.Identifier;

/**
 * Provides a scoped client and closes its underlying connection when the
 * layer's scope ends. Consume subscription streams inside that lifetime.
 *
 * @category Layers
 *
 * @example
 *   import { WebSocketClient } from "@confect/js";
 *   import * as Effect from "effect/Effect";
 *
 *   const deploymentUrl = Effect.gen(function* () {
 *     const client = yield* WebSocketClient.WebSocketClient;
 *     return client.url;
 *   }).pipe(
 *     Effect.provide(WebSocketClient.layer("https://example.convex.cloud")),
 *   );
 *
 * @param address - The Convex deployment URL, such as
 *   `https://example.convex.cloud`.
 * @param options - Options forwarded to Convex's `ConvexClient` constructor.
 *
 * @returns A layer providing {@link WebSocketClient}. Constructor and cleanup
 *   exceptions are defects, not `WebSocketClientError` failures.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.effect(WebSocketClient, make(address, options));
