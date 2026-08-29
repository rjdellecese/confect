import * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class HttpClientError extends Schema.TaggedError<HttpClientError>()(
  "HttpClientError",
  {
    cause: Schema.Unknown,
  },
) {}

export interface Transport {
  readonly url: string;
  readonly setAuth: (token: string) => void;
  readonly clearAuth: () => void;
  readonly query: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicQuery>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>;
  readonly mutation: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicMutation>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>;
  readonly action: (
    functionReference: Ref.FunctionReference<Ref.AnyPublicAction>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>;
}

export const make = (client: Transport) => {
  const setAuth = (token: string) =>
    Effect.sync(() => {
      client.setAuth(token);
    });

  const clearAuth = Effect.sync(() => {
    client.clearAuth();
  });

  const mapUnknownError = (cause: unknown) => new HttpClientError({ cause });

  const query = <Query extends Ref.AnyPublicQuery>(
    ref: Query,
    ...rest: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Query>;
    return Ref.runWithCodec(
      ref,
      args,
      (functionReference, encodedArgs) =>
        client.query(functionReference, encodedArgs),
      mapUnknownError,
    );
  };

  const mutation = <Mutation extends Ref.AnyPublicMutation>(
    ref: Mutation,
    ...rest: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Mutation>;
    return Ref.runWithCodec(
      ref,
      args,
      (functionReference, encodedArgs) =>
        client.mutation(functionReference, encodedArgs),
      mapUnknownError,
    );
  };

  const action = <Action extends Ref.AnyPublicAction>(
    ref: Action,
    ...rest: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    Ref.Returns<Action>,
    Ref.Error<Action> | HttpClientError | Schema.SchemaError
  > => {
    const args = (rest[0] ?? {}) as Ref.Args<Action>;
    return Ref.runWithCodec(
      ref,
      args,
      (functionReference, encodedArgs) =>
        client.action(functionReference, encodedArgs),
      mapUnknownError,
    );
  };

  return {
    url: client.url,
    setAuth,
    clearAuth,
    query,
    mutation,
    action,
  };
};
