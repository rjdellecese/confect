import * as Ref from "@confect/core/Ref";
import { ConvexClient } from "convex/browser";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema, Stream } from "effect";

export class WebSocketClientError extends Schema.TaggedError<WebSocketClientError>()(
  "WebSocketClientError",
  {
    cause: Schema.Unknown,
  },
) {}

type OptionalArgs<
  R extends Ref.AnyPublicQuery | Ref.AnyPublicMutation | Ref.AnyPublicAction,
> = keyof Ref.Args<R> extends never
  ? [args?: Ref.Args<R>]
  : [args: Ref.Args<R>];

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

      const query = <Query extends Ref.AnyPublicQuery>(
        ref: Query,
        ...rest: OptionalArgs<Query>
      ): Effect.Effect<
        Ref.Returns<Query>,
        WebSocketClientError | ParseResult.ParseError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Query>;
        return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
          Effect.tryPromise({
            try: () => convexClient.query(functionReference, encodedArgs),
            catch: (cause) => new WebSocketClientError({ cause }),
          }),
        );
      };

      const mutation = <Mutation extends Ref.AnyPublicMutation>(
        ref: Mutation,
        ...rest: OptionalArgs<Mutation>
      ): Effect.Effect<
        Ref.Returns<Mutation>,
        WebSocketClientError | ParseResult.ParseError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
        return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
          Effect.tryPromise({
            try: () => convexClient.mutation(functionReference, encodedArgs),
            catch: (cause) => new WebSocketClientError({ cause }),
          }),
        );
      };

      const action = <Action extends Ref.AnyPublicAction>(
        ref: Action,
        ...rest: OptionalArgs<Action>
      ): Effect.Effect<
        Ref.Returns<Action>,
        WebSocketClientError | ParseResult.ParseError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Action>;
        return Ref.runWithCodec(ref, args, (functionReference, encodedArgs) =>
          Effect.tryPromise({
            try: () => convexClient.action(functionReference, encodedArgs),
            catch: (cause) => new WebSocketClientError({ cause }),
          }),
        );
      };

      const reactiveQuery = <Query extends Ref.AnyPublicQuery>(
        ref: Query,
        ...rest: OptionalArgs<Query>
      ): Stream.Stream<
        Ref.Returns<Query>,
        WebSocketClientError | ParseResult.ParseError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Query>;
        const functionReference = Ref.getFunctionReference(ref);

        return Stream.unwrapScoped(
          Effect.gen(function* () {
            const encodedArgs = yield* Ref.encodeArgs(ref, args);

            return Stream.asyncScoped<unknown, WebSocketClientError>((emit) =>
              Effect.gen(function* () {
                const unsubscribe = convexClient.onUpdate(
                  functionReference,
                  encodedArgs,
                  (result) => {
                    emit.single(result);
                  },
                  (error) => {
                    emit.fail(new WebSocketClientError({ cause: error }));
                  },
                );
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => unsubscribe()),
                );
              }),
            );
          }),
        ).pipe(
          Stream.mapEffect((encodedReturns) =>
            Ref.decodeReturns(ref, encodedReturns),
          ),
        );
      };

      return {
        url,
        setAuth,
        query,
        mutation,
        action,
        reactiveQuery,
      };
    }),
  );

/**
 * A Confect client which uses a WebSocket to communicate with your Convex backend and supports reactive query subscriptions. The WebSocket connection is managed by the layer's scope and closed automatically when the scope ends. Wraps [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 */
export const WebSocketClient = Context.GenericTag<
  Effect.Effect.Success<ReturnType<typeof make>>
>("@confect/js/WebSocketClient");

export type WebSocketClient = typeof WebSocketClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.scoped(WebSocketClient, make(address, options));
