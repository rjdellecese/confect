import * as Array from "effect/Array";
import { FunctionSpec, Ref } from "@confect/core";
import * as HttpClient from "@confect/js/HttpClient";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import { vi } from "vitest";
import * as LocalBackend from "confect-local-backend/LocalBackend";
import refs from "confect-local-backend/refs";

class MissingValue extends Schema.TaggedError<
  MissingValue,
  { readonly brand: unique symbol }
>()("MissingValue", {
  caseId: Schema.String,
}) {}

const echoDefinition = {
  args: () => ({
    value: Schema.FiniteFromString,
    failure: Schema.optional(Schema.Literals(["typed", "unknown"])),
  }),
  returns: () => Schema.FiniteFromString,
  error: () => MissingValue,
};
const query = Ref.make(
  "clients",
  FunctionSpec.publicQuery({
    ...echoDefinition,
    name: "echoQuery",
  }),
);
const mutation = Ref.make(
  "clients",
  FunctionSpec.publicMutation({
    ...echoDefinition,
    name: "echoMutation",
  }),
);
const action = Ref.make(
  "clients",
  FunctionSpec.publicAction({
    ...echoDefinition,
    name: "echoAction",
  }),
);
const clientLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { client } = yield* LocalBackend.LocalBackend;
    return HttpClient.layer(client.url, { logger: false });
  }),
);

const operations = [
  {
    name: "query",
    run: (client: HttpClient.HttpClient, failure?: "typed" | "unknown") =>
      client.query(query, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
  {
    name: "mutation",
    run: (client: HttpClient.HttpClient, failure?: "typed" | "unknown") =>
      client.mutation(mutation, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
  {
    name: "action",
    run: (client: HttpClient.HttpClient, failure?: "typed" | "unknown") =>
      client.action(action, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
];

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "HttpClient against Convex",
  (backendIt) => {
    backendIt.layer(clientLayer, { buildPerTest: true })((it) => {
      it.effect.each(operations)(
        "$name encodes arguments, decodes results, and traces each execution",
        (operation) =>
          Effect.gen(function* () {
            const client = yield* HttpClient.HttpClient;
            const tracer = yield* Tracer.Tracer;
            const span = vi.fn(tracer.span.bind(tracer));
            const request = operation.run(client);
            expect(span).not.toHaveBeenCalled();
            const observed1 = yield* Effect.all([request, request]).pipe(
              Effect.withSpan("caller"),
              Effect.withTracer(Tracer.make({ span })),
            );
            expect(observed1).toEqual([42, 42]);
            expect(
              Array.map(span.mock.calls, ([options]) => options.name),
            ).toEqual([
              "caller",
              `HttpClient.${operation.name}`,
              `HttpClient.${operation.name}`,
            ]);
            const [parent, ...children] = Array.map(
              span.mock.results,
              (result) => result.value,
            );
            for (const child of children) {
              expect(Option.getOrThrow(child.parent)).toBe(parent);
              assert(child.status._tag === "Ended");
              expect(Exit.isSuccess(child.status.exit)).toBe(true);
            }
            expect(children[0]).not.toBe(children[1]);
          }),
      );

      it.effect.each(operations)(
        "$name distinguishes declared errors from unknown backend errors",
        (operation) =>
          Effect.gen(function* () {
            const client = yield* HttpClient.HttpClient;
            const tracer = yield* Tracer.Tracer;
            const span = vi.fn(tracer.span.bind(tracer));
            const typed = yield* operation
              .run(client, "typed")
              .pipe(Effect.result, Effect.withTracer(Tracer.make({ span })));
            expect(
              Array.map(span.mock.calls, ([options]) => options.name),
            ).toEqual([`HttpClient.${operation.name}`]);
            const child = span.mock.results[0]?.value;
            assert(child !== undefined);
            assert(child.status._tag === "Ended");
            expect(Exit.isFailure(child.status.exit)).toBe(true);
            const typedIsFailure = Result.isFailure(typed);
            assert(typedIsFailure);
            expect(typed.failure).toEqual(
              MissingValue.make({ caseId: "echo" }),
            );
            const unknown = yield* Effect.result(
              operation.run(client, "unknown"),
            );
            const unknownIsFailure = Result.isFailure(unknown);
            assert(unknownIsFailure);
            expect(unknown.failure).toBeInstanceOf(HttpClient.HttpClientError);
          }),
      );

      it.effect("supports omitted arguments for all request types", () =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const returns = () => Schema.FiniteFromString;
          const noArgsQueryRef = Ref.make(
            "clients",
            FunctionSpec.publicQuery({ name: "echoQuery", returns }),
          );
          const noArgsMutationRef = Ref.make(
            "clients",
            FunctionSpec.publicMutation({
              name: "echoMutation",
              returns,
            }),
          );
          const noArgsActionRef = Ref.make(
            "clients",
            FunctionSpec.publicAction({ name: "echoAction", returns }),
          );
          type NoArgsRef =
            | typeof noArgsQueryRef
            | typeof noArgsMutationRef
            | typeof noArgsActionRef;
          expectTypeOf<Ref.Error<NoArgsRef>>().toEqualTypeOf<never>();
          expectTypeOf<Ref.Returns<NoArgsRef>>().toEqualTypeOf<number>();
          const observed2 = yield* client.query(
            Ref.make(
              "clients",
              FunctionSpec.publicQuery({ name: "echoQuery", returns }),
            ),
          );
          expect(observed2).toBe(0);
          const observed3 = yield* client.mutation(
            Ref.make(
              "clients",
              FunctionSpec.publicMutation({
                name: "echoMutation",
                returns,
              }),
            ),
          );
          expect(observed3).toBe(0);
          const observed4 = yield* client.action(
            Ref.make(
              "clients",
              FunctionSpec.publicAction({ name: "echoAction", returns }),
            ),
          );
          expect(observed4).toBe(0);
        }),
      );

      it.effect(
        "keeps HTTP mutation codecs and errors when bypassing the queue",
        () =>
          Effect.gen(function* () {
            const client = yield* HttpClient.HttpClient;
            const options = { skipQueue: true };
            const observed5 = yield* client.mutation(
              mutation,
              { value: 42 },
              options,
            );
            expect(observed5).toBe(42);
            const noArgs = Ref.make(
              "clients",
              FunctionSpec.publicMutation({
                name: "echoMutation",
                returns: () => Schema.FiniteFromString,
              }),
            );
            const observed6 = yield* client.mutation(
              noArgs,
              undefined,
              options,
            );
            expect(observed6).toBe(0);
            const observed7 = yield* client.mutation(noArgs, {}, options);
            expect(observed7).toBe(0);
            const typed = yield* Effect.result(
              client.mutation(
                mutation,
                { value: 42, failure: "typed" },
                options,
              ),
            );
            const typedIsFailure = Result.isFailure(typed);
            assert(typedIsFailure);
            expect(typed.failure).toEqual(
              MissingValue.make({ caseId: "echo" }),
            );
            const unknown = yield* Effect.result(
              client.mutation(
                mutation,
                { value: 42, failure: "unknown" },
                options,
              ),
            );
            const unknownIsFailure = Result.isFailure(unknown);
            assert(unknownIsFailure);
            expect(unknown.failure).toBeInstanceOf(HttpClient.HttpClientError);
          }),
      );

      it.effect("reports argument and return codec failures", () =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const invalidArgs = Ref.make(
            "clients",
            FunctionSpec.publicQuery({
              name: "echoQuery",
              args: () => ({ value: Schema.String.check(Schema.isNonEmpty()) }),
              returns: () => Schema.String,
            }),
          );
          const encoding = yield* Effect.result(
            client.query(invalidArgs, { value: "" }),
          );
          const encodingIsFailure = Result.isFailure(encoding);
          assert(encodingIsFailure);
          expect(encoding.failure).toBeInstanceOf(Schema.SchemaError);
          const invalidReturns = Ref.make(
            "clients",
            FunctionSpec.publicQuery({
              name: "echoQuery",
              args: () => ({ value: Schema.String }),
              returns: () => Schema.FiniteFromString,
            }),
          );
          const decoding = yield* Effect.result(
            client.query(invalidReturns, { value: "not a number" }),
          );
          const decodingIsFailure = Result.isFailure(decoding);
          assert(decodingIsFailure);
          expect(decoding.failure).toBeInstanceOf(Schema.SchemaError);
        }),
      );

      it.effect("defers backend mutations until the effect executes", () =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const caseId = "http-laziness";
          yield* client.mutation(refs.public.clients.write, {
            caseId,
            value: "before",
          });
          const request = client.mutation(refs.public.clients.write, {
            caseId,
            value: "after",
          });
          const observed8 = yield* client.query(refs.public.clients.read, {
            caseId,
          });
          expect(observed8).toBe("before");
          yield* request;
          const observed9 = yield* client.query(refs.public.clients.read, {
            caseId,
          });
          expect(observed9).toBe("after");
          yield* client.mutation(refs.public.clients.write, {
            caseId,
            value: null,
          });
        }),
      );

      it.effect(
        "exposes the URL and applies auth changes only when executed",
        () =>
          Effect.gen(function* () {
            const client = yield* HttpClient.HttpClient;
            const { client: backend } = yield* LocalBackend.LocalBackend;
            expect(client.url).toBe(backend.url);
            const setAuth = client.setAuth("invalid-token");
            const observed10 = yield* client.query(query, { value: 42 });
            expect(observed10).toBe(42);

            yield* setAuth;
            const clearAuth = client.clearAuth;
            const rejected = yield* Effect.result(
              client.query(query, { value: 42 }),
            );
            const rejectedIsFailure = Result.isFailure(rejected);
            assert(rejectedIsFailure);
            expect(rejected.failure).toBeInstanceOf(HttpClient.HttpClientError);

            yield* clearAuth;
            const observed11 = yield* client.query(query, { value: 42 });
            expect(observed11).toBe(42);
          }),
      );
    });
  },
);
