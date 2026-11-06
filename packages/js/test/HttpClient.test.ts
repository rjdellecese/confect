import { FunctionSpec, Ref } from "@confect/core";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as HttpClient from "@confect/js/HttpClient";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
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

class NotFound extends Schema.TaggedError<
  NotFound,
  { readonly brand: unique symbol }
>()("NotFound", {
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
    ).parameters.toEqualTypeOf<
      [
        ref: typeof noArgsMutationRef,
        args?: {},
        options?: { skipQueue: boolean },
      ]
    >();
    expectTypeOf(
      client.mutation<typeof argsMutationRef>,
    ).parameters.toEqualTypeOf<
      [
        ref: typeof argsMutationRef,
        args: { readonly text: string },
        options?: { skipQueue: boolean },
      ]
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
    expectTypeOf(
      client.mutation(mutationWithError, { id: "abc" }, { skipQueue: true }),
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

it.effect(
  "bypasses only the opted-in mutation without changing codecs or laziness",
  () =>
    Effect.gen(function* () {
      const requests = yield* Queue.unbounded<{
        readonly body: BodyInit | null | undefined;
        readonly response: Deferred.Deferred<Response>;
      }>();
      const context = yield* Effect.context<never>();
      const runPromise = Effect.runPromiseWith(context);
      const fetch: typeof globalThis.fetch = Object.assign(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          Effect.gen(function* () {
            const response = yield* Deferred.make<Response>();
            yield* Queue.offer(requests, { body: init?.body, response });
            return yield* Deferred.await(response);
          }).pipe(runPromise),
        { preconnect: () => {} },
      );
      const ref = Ref.make(
        "numbers",
        FunctionSpec.publicMutation({
          name: "echo",
          args: () => ({ value: Schema.FiniteFromString }),
          returns: () => Schema.FiniteFromString,
        }),
      );
      const services = yield* Layer.build(
        HttpClient.layer("https://example-123.convex.cloud", { fetch }),
      );
      yield* Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const args = { value: 3 };
        const options = { skipQueue: true };
        const bypass = client.mutation(ref, args, options);
        const observed1 = yield* Queue.size(requests);
        expect(observed1).toBe(0);

        const first = yield* client
          .mutation(ref, { value: 1 })
          .pipe(Effect.forkScoped);
        const firstRequest = yield* Queue.take(requests);
        const queued = yield* client
          .mutation(ref, { value: 2 }, { skipQueue: false })
          .pipe(Effect.forkScoped);
        yield* Effect.yieldNow;
        const immediate = yield* bypass.pipe(Effect.forkScoped);
        const immediateRequest = yield* Queue.take(requests);
        const observed2 = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(firstRequest.body);
        expect(observed2).toEqual({
          path: "numbers:echo",
          format: "convex_encoded_json",
          args: [{ value: "1" }],
        });
        const observed3 = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(immediateRequest.body);
        expect(observed3).toEqual({
          path: "numbers:echo",
          format: "convex_encoded_json",
          args: [{ value: "3" }],
        });
        yield* Deferred.succeed(
          immediateRequest.response,
          Response.json({ status: "success", value: "3" }),
        );
        const observed4 = yield* Fiber.join(immediate);
        expect(observed4).toBe(3);
        const observed5 = yield* Queue.size(requests);
        expect(observed5).toBe(0);

        yield* Deferred.succeed(
          firstRequest.response,
          Response.json({ status: "success", value: "1" }),
        );
        const observed6 = yield* Fiber.join(first);
        expect(observed6).toBe(1);
        const queuedRequest = yield* Queue.take(requests);
        const observed7 = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(queuedRequest.body);
        expect(observed7).toEqual({
          path: "numbers:echo",
          format: "convex_encoded_json",
          args: [{ value: "2" }],
        });
        yield* Deferred.succeed(
          queuedRequest.response,
          Response.json({ status: "success", value: "2" }),
        );
        const observed8 = yield* Fiber.join(queued);
        expect(observed8).toBe(2);
        expect(args).toEqual({ value: 3 });
        expect(options).toEqual({ skipQueue: true });
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped),
);
