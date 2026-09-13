import * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

export class WebSocketClientError extends Schema.TaggedError<WebSocketClientError>()(
  "WebSocketClientError",
  {
    cause: Schema.Defect(),
  },
) {}

export interface Transport {
  readonly setAuth: (
    fetchToken: (args: {
      readonly forceRefreshToken: boolean;
    }) => Promise<string | null | undefined>,
    onChange?: (isAuthenticated: boolean) => void,
  ) => void;
  readonly close: () => Promise<void>;
  readonly query: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicQuery>,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This raw transport receives args encoded by Ref.runWithCodec; their representation depends on the ref.
    encodedArgs: unknown,
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- Ref.runWithCodec owns return decoding after this raw transport promise resolves.
  ) => PromiseLike<unknown>;
  readonly mutation: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicMutation>,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This raw transport receives args encoded by Ref.runWithCodec; their representation depends on the ref.
    encodedArgs: unknown,
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- Ref.runWithCodec owns return decoding after this raw transport promise resolves.
  ) => PromiseLike<unknown>;
  readonly action: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicAction>,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This raw transport receives args encoded by Ref.runWithCodec; their representation depends on the ref.
    encodedArgs: unknown,
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- Ref.runWithCodec owns return decoding after this raw transport promise resolves.
  ) => PromiseLike<unknown>;
  readonly onUpdate: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicQuery>,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Subscription args have already passed through the ref encoder; their wire representation is ref-specific.
    encodedArgs: unknown,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Subscription emissions remain untrusted until reactiveQuery applies Ref.decodeReturns.
    onUpdate: (result: unknown) => void,
    onError: (error: Error) => void,
  ) => () => void;
}

const runQuery = Effect.fn("WebSocketClient.query")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runMutation = Effect.fn("WebSocketClient.mutation")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const runAction = Effect.fn("WebSocketClient.action")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

export const make = (address: string, convexClient: Transport) => {
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
    // SAFETY: OptionalArgs permits omission only for an empty argument record; supplied args already have this ref's Args type.
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
    // SAFETY: OptionalArgs permits omission only for an empty argument record; supplied args already have this ref's Args type.
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
    // SAFETY: OptionalArgs permits omission only for an empty argument record; supplied args already have this ref's Args type.
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

    // SAFETY: OptionalArgs permits omission only for an empty argument record; supplied args already have this ref's Args type.
    const args = (rest[0] ?? {}) as Ref.Args<Query>;
    const functionReference = Ref.getFunctionReference(ref);
    const onError = Ref.decodeErrorOrElse(ref, mapUnknownError);

    return Stream.unwrap(
      Effect.match(Ref.encodeArgs(ref, args), {
        onFailure: (error) => Stream.succeed<QueryResult>(Result.fail(error)),
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
    url: address,
    setAuth,
    query,
    mutation,
    action,
    reactiveQuery,
    reactiveQueryResult,
  };
};

export const makeScoped = <E, R>(
  address: string,
  acquire: Effect.Effect<Transport, E, R>,
) =>
  Effect.acquireRelease(acquire, (convexClient) =>
    Effect.promise(() => convexClient.close()),
  ).pipe(Effect.map((convexClient) => make(address, convexClient)));
