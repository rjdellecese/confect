import * as Ref from "@confect/core/Ref";
import { ConvexClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema, Stream } from "effect";

export class ConfectClientError extends Schema.TaggedError<ConfectClientError>()(
  "ConfectClientError",
  {
    cause: Schema.Unknown,
  },
) {}

type OptionalArgs<R extends Ref.AnyQuery | Ref.AnyMutation | Ref.AnyAction> =
  keyof Ref.Args<R> extends never ? [args?: Ref.Args<R>] : [args: Ref.Args<R>];

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

      const query = <Query extends Ref.AnyQuery>(
        ref: Query,
        ...rest: OptionalArgs<Query>
      ): Effect.Effect<
        Ref.Returns<Query>,
        ConfectClientError | ParseResult.ParseError
      > =>
        Effect.gen(function* () {
          const args = (rest[0] ?? {}) as Ref.Args<Query>;
          const functionSpec = Ref.getFunctionSpec(ref);
          const functionName = Ref.getConvexFunctionName(
            ref,
          ) as unknown as FunctionReference<"query">;

          return yield* Match.value(functionSpec.functionProvenance).pipe(
            Match.tag("Confect", (confectFunctionSpec) =>
              Effect.gen(function* () {
                const encodedArgs = yield* Schema.encode(
                  confectFunctionSpec.args,
                )(args);

                const encodedResult = yield* Effect.tryPromise({
                  try: () => convexClient.query(functionName, encodedArgs),
                  catch: (cause) => new ConfectClientError({ cause }),
                });

                return yield* Schema.decode(confectFunctionSpec.returns)(
                  encodedResult,
                );
              }),
            ),
            Match.tag("Convex", () =>
              Effect.tryPromise({
                try: () => convexClient.query(functionName, args),
                catch: (cause) => new ConfectClientError({ cause }),
              }),
            ),
            Match.exhaustive,
          );
        });

      const mutation = <Mutation extends Ref.AnyMutation>(
        ref: Mutation,
        ...rest: OptionalArgs<Mutation>
      ): Effect.Effect<
        Ref.Returns<Mutation>,
        ConfectClientError | ParseResult.ParseError
      > =>
        Effect.gen(function* () {
          const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
          const functionSpec = Ref.getFunctionSpec(ref);
          const functionName = Ref.getConvexFunctionName(
            ref,
          ) as unknown as FunctionReference<"mutation">;

          return yield* Match.value(functionSpec.functionProvenance).pipe(
            Match.tag("Confect", (confectFunctionSpec) =>
              Effect.gen(function* () {
                const encodedArgs = yield* Schema.encode(
                  confectFunctionSpec.args,
                )(args);

                const encodedResult = yield* Effect.tryPromise({
                  try: () => convexClient.mutation(functionName, encodedArgs),
                  catch: (cause) => new ConfectClientError({ cause }),
                });

                return yield* Schema.decode(confectFunctionSpec.returns)(
                  encodedResult,
                );
              }),
            ),
            Match.tag("Convex", () =>
              Effect.tryPromise({
                try: () => convexClient.mutation(functionName, args),
                catch: (cause) => new ConfectClientError({ cause }),
              }),
            ),
            Match.exhaustive,
          );
        });

      const action = <Action extends Ref.AnyAction>(
        ref: Action,
        ...rest: OptionalArgs<Action>
      ): Effect.Effect<
        Ref.Returns<Action>,
        ConfectClientError | ParseResult.ParseError
      > =>
        Effect.gen(function* () {
          const args = (rest[0] ?? {}) as Ref.Args<Action>;
          const functionSpec = Ref.getFunctionSpec(ref);
          const functionName = Ref.getConvexFunctionName(
            ref,
          ) as unknown as FunctionReference<"action">;

          return yield* Match.value(functionSpec.functionProvenance).pipe(
            Match.tag("Confect", (confectFunctionSpec) =>
              Effect.gen(function* () {
                const encodedArgs = yield* Schema.encode(
                  confectFunctionSpec.args,
                )(args);

                const encodedResult = yield* Effect.tryPromise({
                  try: () => convexClient.action(functionName, encodedArgs),
                  catch: (cause) => new ConfectClientError({ cause }),
                });

                return yield* Schema.decode(confectFunctionSpec.returns)(
                  encodedResult,
                );
              }),
            ),
            Match.tag("Convex", () =>
              Effect.tryPromise({
                try: () => convexClient.action(functionName, args),
                catch: (cause) => new ConfectClientError({ cause }),
              }),
            ),
            Match.exhaustive,
          );
        });

      const reactiveQuery = <Query extends Ref.AnyQuery>(
        ref: Query,
        ...rest: OptionalArgs<Query>
      ): Stream.Stream<
        Ref.Returns<Query>,
        ConfectClientError | ParseResult.ParseError
      > => {
        const args = (rest[0] ?? {}) as Ref.Args<Query>;
        const functionSpec = Ref.getFunctionSpec(ref);
        const functionName = Ref.getConvexFunctionName(
          ref,
        ) as unknown as FunctionReference<"query">;

        return Match.value(functionSpec.functionProvenance).pipe(
          Match.tag("Confect", (confectFunctionSpec) =>
            Stream.unwrapScoped(
              Effect.gen(function* () {
                const encodedArgs = yield* Schema.encode(
                  confectFunctionSpec.args,
                )(args);

                return Stream.asyncScoped<unknown, ConfectClientError>((emit) =>
                  Effect.gen(function* () {
                    const unsubscribe = convexClient.onUpdate(
                      functionName,
                      encodedArgs,
                      (result) => {
                        emit.single(result);
                      },
                      (error) => {
                        emit.fail(new ConfectClientError({ cause: error }));
                      },
                    );
                    yield* Effect.addFinalizer(() =>
                      Effect.sync(() => unsubscribe()),
                    );
                  }),
                );
              }),
            ).pipe(
              Stream.mapEffect((raw) =>
                Schema.decode(confectFunctionSpec.returns)(raw),
              ),
            ),
          ),
          Match.tag("Convex", () =>
            Stream.asyncScoped<Ref.Returns<Query>, ConfectClientError>((emit) =>
              Effect.gen(function* () {
                const unsubscribe = convexClient.onUpdate(
                  functionName,
                  args,
                  (result) => {
                    emit.single(result);
                  },
                  (error) => {
                    emit.fail(new ConfectClientError({ cause: error }));
                  },
                );
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => unsubscribe()),
                );
              }),
            ),
          ),
          Match.exhaustive,
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

type ServiceShape = Effect.Effect.Success<ReturnType<typeof make>>;

/**
 * A Confect client which uses a WebSocket to communicate with your Convex backend and supports reactive query subscriptions. The WebSocket connection is managed by the layer's scope and closed automatically when the scope ends. Wraps [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 */
export const ConfectClient = Context.GenericTag<ServiceShape>(
  "@confect/js/ConfectClient",
);

export type ConfectClient = typeof ConfectClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.scoped(ConfectClient, make(address, options));
