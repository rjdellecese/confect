import * as Ref from "@confect/core/Ref";
import { ConvexHttpClient as ConvexHttpClient_ } from "convex/browser";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

export class HttpClientError extends Schema.TaggedError<HttpClientError>()(
  "HttpClientError",
  {
    cause: Schema.Unknown,
  },
) {
  override get message() {
    return `Convex HTTP Client Error: ${JSON.stringify(this.cause, null, 2)}`;
  }
}

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient_>[1],
) => {
  const client = new ConvexHttpClient_(address, options);

  const setAuth = (token: string) =>
    Effect.sync(() => {
      client.setAuth(token);
    });

  const clearAuth = () =>
    Effect.sync(() => {
      client.clearAuth();
    });

  const query = <Query extends Ref.AnyQuery>(
    ref: Query,
    args: Ref.Args<Query>["Type"],
  ): Effect.Effect<
    Ref.Returns<Query>["Type"],
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const function_ = Ref.getFunction(ref);
      const functionName = Ref.getConvexFunctionName(ref);

      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const encodedResult = yield* Effect.tryPromise({
        try: () => client.query(functionName as any, encodedArgs),
        catch: (cause) => new HttpClientError({ cause }),
      });

      return yield* Schema.decode(function_.returns)(encodedResult);
    });

  const mutation = <Mutation extends Ref.AnyMutation>(
    ref: Mutation,
    args: Ref.Args<Mutation>["Type"],
  ): Effect.Effect<
    Ref.Returns<Mutation>["Type"],
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const function_ = Ref.getFunction(ref);
      const functionName = Ref.getConvexFunctionName(ref);

      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const encodedResult = yield* Effect.tryPromise({
        try: () => client.mutation(functionName as any, encodedArgs),
        catch: (cause) => new HttpClientError({ cause }),
      });

      return yield* Schema.decode(function_.returns)(encodedResult);
    });

  const action = <Action extends Ref.AnyAction>(
    ref: Action,
    args: Ref.Args<Action>["Type"],
  ): Effect.Effect<
    Ref.Returns<Action>["Type"],
    HttpClientError | ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const function_ = Ref.getFunction(ref);
      const functionName = Ref.getConvexFunctionName(ref);

      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const encodedResult = yield* Effect.tryPromise({
        try: () => client.action(functionName as any, encodedArgs),
        catch: (cause) => new HttpClientError({ cause }),
      });

      return yield* Schema.decode(function_.returns)(encodedResult);
    });

  return {
    setAuth,
    clearAuth,
    query,
    mutation,
    action,
  };
};

export const HttpClient = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/HttpClient",
);

export type HttpClient = typeof HttpClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient_>[1],
) =>
  Layer.effect(
    HttpClient,
    Effect.sync(() => make(address, options)),
  );
