import { FunctionSpec, Ref } from "@confect/core";
import { expectTypeOf, it } from "@effect/vitest";
import type * as HttpClient from "@confect/js/HttpClient";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
  const check = (client: HttpClient.HttpClient) => {
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
        NotFound | HttpClient.HttpClientError | Schema.SchemaError
      >
    >();
    expectTypeOf(
      client.mutation(mutationWithError, { id: "abc" }),
    ).toEqualTypeOf<
      Effect.Effect<
        null,
        NotFound | HttpClient.HttpClientError | Schema.SchemaError
      >
    >();
    expectTypeOf(client.action(actionWithError, { id: "abc" })).toEqualTypeOf<
      Effect.Effect<
        null,
        NotFound | HttpClient.HttpClientError | Schema.SchemaError
      >
    >();
  };
  expectTypeOf(check).toBeFunction();
});
