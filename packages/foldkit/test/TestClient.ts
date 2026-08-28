import * as CoreRef from "@confect/core/Ref";
import type * as WebSocketClient from "@confect/js/WebSocketClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Client from "@confect/foldkit/Client";

export interface Call {
  readonly method: "query" | "mutation" | "action" | "reactiveQuery";
  readonly name: string;
  readonly args: unknown;
}

export interface Service extends Client.Client {
  // Keep inspection operations function-valued, like the fake's controls.
  // @effect-diagnostics-next-line lazyEffect:off
  readonly calls: () => Effect.Effect<ReadonlyArray<Call>>;
  readonly setNextResult: (
    result: Effect.Effect<unknown, unknown>,
  ) => Effect.Effect<void>;
  readonly setReactiveQueryResults: (
    results: Stream.Stream<Result.Result<unknown, unknown>, never, never>,
  ) => Effect.Effect<void>;
}

export const TestClient = Context.Service<Service>(
  "@confect/foldkit/test/TestClient",
);

export type TestClient = typeof TestClient.Identifier;

const failRejection = <Ref_ extends CoreRef.Any>(
  ref: Ref_,
  rejection: unknown,
): Effect.Effect<
  never,
  CoreRef.Error<Ref_> | Client.WebSocketClientError | Schema.SchemaError
> => {
  if (rejection instanceof Client.WebSocketClientError) {
    return Effect.fail(rejection);
  }
  if (Schema.isSchemaError(rejection)) {
    return Effect.fail(rejection);
  }

  return Option.match(CoreRef.decodeErrorOption(ref, rejection), {
    onNone: () => Effect.die(rejection),
    onSome: Effect.fail,
  });
};

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const recordedCalls = yield* Ref.make<ReadonlyArray<Call>>([]);
    const nextResult = yield* Ref.make<Effect.Effect<unknown, unknown>>(
      Effect.succeed({}),
    );
    const nextReactiveQueryResults = yield* Ref.make<
      Stream.Stream<Result.Result<unknown, unknown>, never, never>
    >(Stream.empty);

    const record = (method: Call["method"], ref: CoreRef.Any, args: unknown) =>
      Ref.update(recordedCalls, (calls) => [
        ...calls,
        {
          method,
          name: CoreRef.getConvexFunctionName(ref),
          args,
        },
      ]);

    const invoke = Effect.fn("TestClient.invoke")(function* <
      Ref_ extends CoreRef.Any,
    >(method: "query" | "mutation" | "action", ref: Ref_, args: unknown) {
      yield* record(method, ref, args);
      const effect = yield* Ref.get(nextResult);
      const encodedReturns = yield* effect.pipe(
        Effect.catch((rejection) => failRejection(ref, rejection)),
      );
      return yield* CoreRef.decodeReturns(ref, encodedReturns);
    });

    const reactiveQueryResult = <Query extends CoreRef.AnyPublicQuery>(
      ref: Query,
      ...rest: CoreRef.OptionalArgs<Query>
    ): Stream.Stream<
      Result.Result<
        CoreRef.Returns<Query>,
        CoreRef.Error<Query> | Client.WebSocketClientError | Schema.SchemaError
      >
    > =>
      Stream.unwrap(
        Effect.gen(function* () {
          const args = rest[0] ?? {};
          yield* record("reactiveQuery", ref, args);
          const results = yield* Ref.get(nextReactiveQueryResults);

          type QueryResult = Result.Result<
            CoreRef.Returns<Query>,
            | CoreRef.Error<Query>
            | Client.WebSocketClientError
            | Schema.SchemaError
          >;

          const decodeResult = (
            result: Result.Result<unknown, unknown>,
          ): Effect.Effect<QueryResult> => {
            if (Result.isFailure(result)) {
              return failRejection(ref, result.failure).pipe(
                Effect.match({
                  onFailure: (failure): QueryResult => Result.fail(failure),
                  onSuccess: (success): QueryResult => Result.succeed(success),
                }),
              );
            }

            return CoreRef.decodeReturns(ref, result.success).pipe(
              Effect.match({
                onFailure: (failure): QueryResult => Result.fail(failure),
                onSuccess: (success): QueryResult => Result.succeed(success),
              }),
            );
          };

          return results.pipe(Stream.mapEffect(decodeResult));
        }),
      );

    const webSocketClient: WebSocketClient.WebSocketClient = {
      url: "https://test.convex.cloud",
      setAuth: () => Effect.void,
      query: (ref, ...rest) => invoke("query", ref, rest[0] ?? {}),
      mutation: (ref, ...rest) => invoke("mutation", ref, rest[0] ?? {}),
      action: (ref, ...rest) => invoke("action", ref, rest[0] ?? {}),
      reactiveQueryResult,
      reactiveQuery: (ref, ...rest) =>
        reactiveQueryResult(ref, ...rest).pipe(
          Stream.mapEffect(
            Result.match({
              onFailure: Effect.fail,
              onSuccess: Effect.succeed,
            }),
          ),
        ),
    };

    const client = yield* Client.make(webSocketClient);
    const service: Service = {
      ...client,
      calls: Effect.fn("TestClient.calls")(function* () {
        return yield* Ref.get(recordedCalls);
      }),
      setNextResult: Effect.fn("TestClient.setNextResult")(function* (result) {
        yield* Ref.set(nextResult, result);
      }),
      setReactiveQueryResults: Effect.fn("TestClient.setReactiveQueryResults")(
        function* (results) {
          yield* Ref.set(nextReactiveQueryResults, results);
        },
      ),
    };

    return Context.empty().pipe(
      Context.add(Client.Client, service),
      Context.add(TestClient, service),
    );
  }),
);
