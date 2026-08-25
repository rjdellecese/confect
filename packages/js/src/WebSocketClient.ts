import * as Ref from "@confect/core/Ref";
import { ConvexClient } from "convex/browser";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

export class WebSocketClientError extends Schema.TaggedError<WebSocketClientError>()(
  "WebSocketClientError",
  {
    cause: Schema.Unknown,
  },
) {}

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) =>
  Effect.acquireRelease(
    Effect.sync(() => new ConvexClient(address, options)),
    (convexClient) => Effect.promise(() => convexClient.close()),
  ).pipe(
    Effect.map((convexClient) => {
      const url = address;

      const setAuth = (
        fetchToken: (args: {
          forceRefreshToken: boolean;
        }) => Effect.Effect<string | null | undefined>,
        onChange?: (isAuthenticated: boolean) => Effect.Effect<void>,
      ) =>
        Effect.sync(() => {
          convexClient.setAuth(
            (args) => Effect.runPromise(fetchToken(args)),
            ...(onChange
              ? [
                  (isAuthenticated: boolean) =>
                    Effect.runFork(onChange(isAuthenticated)),
                ]
              : []),
          );
        });

      const mapUnknownError = (cause: unknown) =>
        new WebSocketClientError({ cause });

      const query = <Query extends Ref.AnyPublicQuery>(
        ref: Query,
        ...rest: Ref.OptionalArgs<Query>
      ): Effect.Effect<
        Ref.Returns<Query>,
        Ref.Error<Query> | WebSocketClientError | Schema.SchemaError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Query>;
        return Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.query(functionReference, encodedArgs),
          mapUnknownError,
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
        return Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.mutation(functionReference, encodedArgs),
          mapUnknownError,
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
        return Ref.runWithCodec(
          ref,
          args,
          (functionReference, encodedArgs) =>
            convexClient.action(functionReference, encodedArgs),
          mapUnknownError,
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
              Stream.succeed<QueryResult>(Result.fail(error)),
            onSuccess: (encodedArgs) =>
              Stream.callback<
                Result.Result<unknown, ReactiveQueryError<Query>>
              >((queue) =>
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
                Effect.match(Ref.decodeReturns(ref, encodedReturns), {
                  onFailure: Result.fail,
                  onSuccess: Result.succeed,
                }),
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
        url,
        setAuth,
        query,
        mutation,
        action,
        reactiveQuery,
        reactiveQueryResult,
      };
    }),
  );

/**
 * A Confect client which uses a WebSocket to communicate with your Convex backend and supports reactive query subscriptions. The WebSocket connection is managed by the layer's scope and closed automatically when the scope ends. Wraps [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 */
export const WebSocketClient = Context.Service<
  Effect.Success<ReturnType<typeof make>>
>("@confect/js/WebSocketClient");

export type WebSocketClient = typeof WebSocketClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.effect(WebSocketClient, make(address, options));
