import { FunctionSpec, Ref } from "@confect/core";
import { expectTypeOf, it } from "@effect/vitest";
import type * as WebSocketClient from "@confect/js/WebSocketClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

class TokenProvider extends Context.Service<
  TokenProvider,
  {
    readonly fetch: (
      forceRefresh: boolean,
    ) => Effect.Effect<string | null | undefined>;
  }
>()("@confect/js/test/WebSocketClient.test/TokenProvider") {}

class AuthObserver extends Context.Service<
  AuthObserver,
  {
    readonly notify: (authenticated: boolean) => Effect.Effect<void>;
  }
>()("@confect/js/test/WebSocketClient.test/AuthObserver") {}

const noArgsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    returns: () => Schema.Struct({}),
  }),
);

const argsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsMutationRef = Ref.make(
  "tasks",
  FunctionSpec.publicMutation({
    name: "cleanup",
    returns: () => Schema.Struct({}),
  }),
);

const argsMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => ({ text: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsActionRef = Ref.make(
  "random",
  FunctionSpec.publicAction({
    name: "getNumber",
    returns: () => Schema.Struct({}),
  }),
);

const argsActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: () => ({ to: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
    error: () => NotFound,
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

it("preserves generic arguments, results, and error channels", () => {
  const check = (client: WebSocketClient.WebSocketClient) => {
    expectTypeOf(client.query<typeof noArgsQueryRef>).parameters.toEqualTypeOf<
      [ref: typeof noArgsQueryRef, args?: {}]
    >();
    expectTypeOf(client.query<typeof argsQueryRef>).parameters.toEqualTypeOf<
      [ref: typeof argsQueryRef, args: { readonly id: string }]
    >();
    expectTypeOf(
      client.mutation<typeof noArgsMutationRef>,
    ).parameters.toEqualTypeOf<[ref: typeof noArgsMutationRef, args?: {}]>();
    expectTypeOf(
      client.mutation<typeof argsMutationRef>,
    ).parameters.toEqualTypeOf<
      [ref: typeof argsMutationRef, args: { readonly text: string }]
    >();
    expectTypeOf(client.action<typeof argsActionRef>).parameters.toEqualTypeOf<
      [ref: typeof argsActionRef, args: { readonly to: string }]
    >();
    expectTypeOf(
      client.action<typeof noArgsActionRef>,
    ).parameters.toEqualTypeOf<[ref: typeof noArgsActionRef, args?: {}]>();
    expectTypeOf(client.query(queryWithError, { id: "abc" })).toEqualTypeOf<
      Effect.Effect<
        { readonly text: string },
        NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
      >
    >();
    expectTypeOf(
      client.mutation(mutationWithError, { id: "abc" }),
    ).toEqualTypeOf<
      Effect.Effect<
        null,
        NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
      >
    >();
    expectTypeOf(client.action(actionWithError, { id: "abc" })).toEqualTypeOf<
      Effect.Effect<
        null,
        NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
      >
    >();
  };
  expectTypeOf(check).toBeFunction();
});

it("infers auth callback dependencies and requires handled errors", () => {
  const check = (client: WebSocketClient.WebSocketClient) => {
    expectTypeOf(
      client.setAuth(
        () => Effect.flatMap(TokenProvider, (tokens) => tokens.fetch(false)),
        (authenticated) =>
          Effect.flatMap(AuthObserver, (observer) =>
            observer.notify(authenticated),
          ),
      ),
    ).toEqualTypeOf<Effect.Effect<void, never, TokenProvider | AuthObserver>>();
    expectTypeOf(
      client.setAuth(() => Effect.succeed(null), undefined),
    ).toEqualTypeOf<Effect.Effect<void>>();
    expectTypeOf(
      client.setAuth(
        () => Effect.succeed(null),
        (authenticated) =>
          Effect.flatMap(AuthObserver, (observer) =>
            observer.notify(authenticated),
          ),
      ),
    ).toEqualTypeOf<Effect.Effect<void, never, AuthObserver>>();
    expectTypeOf(
      client.setAuth(
        // @ts-expect-error Token callbacks must handle typed failures.
        () => Effect.fail("token failure"),
      ),
    );
    expectTypeOf(
      client.setAuth(
        () => Effect.succeed(null),
        // @ts-expect-error Observer callbacks must handle typed failures.
        () => Effect.fail("observer failure"),
      ),
    );
  };
  expectTypeOf(check).toBeFunction();
});
