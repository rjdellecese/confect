import * as Refs from "@confect/core/Refs";
import { ConvexHttpClient as ConvexHttpClient_ } from "convex/browser";
import { Context, Effect, Layer, Schema } from "effect";

export class HttpClientError extends Schema.TaggedError<HttpClientError>()(
  "HttpClientError",
  {
    cause: Schema.Unknown,
  }
) {
  override get message() {
    return `Convex HTTP Client Error: ${JSON.stringify(this.cause, null, 2)}`;
  }
}

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient_>[1]
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

  const query = <Query extends Refs.AnyQuery>(
    ref: Query,
    args: Refs.Args<Query>["Type"]
  ) =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(ref);
      const functionName = Refs.getConvexFunctionName(ref);

      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const encodedResult = yield* Effect.tryPromise({
        try: () => client.query(functionName as any, encodedArgs),
        catch: (cause) => new HttpClientError({ cause }),
      });

      return yield* Schema.decode(function_.returns)(encodedResult);
    });

  const mutation = <Mutation extends Refs.AnyMutation>(
    ref: Mutation,
    args: Refs.Args<Mutation>["Type"]
  ) =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(ref);
      const functionName = Refs.getConvexFunctionName(ref);

      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const encodedResult = yield* Effect.tryPromise({
        try: () => client.mutation(functionName as any, encodedArgs),
        catch: (cause) => new HttpClientError({ cause }),
      });

      return yield* Schema.decode(function_.returns)(encodedResult);
    });

  const action = <Action extends Refs.AnyAction>(
    ref: Action,
    args: Refs.Args<Action>["Type"]
  ) =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(ref);
      const functionName = Refs.getConvexFunctionName(ref);

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
  "@confect/server/HttpClient"
);

export type HttpClient = typeof HttpClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient_>[1]
) =>
  Layer.effect(
    HttpClient,
    Effect.sync(() => make(address, options))
  );
