import { FunctionSpec, Ref } from "@confect/core";
import * as HttpClient from "@confect/js/HttpClient";
import { assert, expect, layer } from "@effect/vitest";
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

class MissingValue extends Schema.TaggedError<MissingValue>()("MissingValue", {
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
      client.query(query, { value: 42, ...(failure ? { failure } : {}) }),
  },
  {
    name: "mutation",
    run: (client: HttpClient.HttpClient, failure?: "typed" | "unknown") =>
      client.mutation(mutation, { value: 42, ...(failure ? { failure } : {}) }),
  },
  {
    name: "action",
    run: (client: HttpClient.HttpClient, failure?: "typed" | "unknown") =>
      client.action(action, { value: 42, ...(failure ? { failure } : {}) }),
  },
];

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "HttpClient against Convex",
  (it) => {
    it.effect.each(operations)(
      "$name encodes arguments, decodes results, and traces each execution",
      (operation) =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const tracer = yield* Tracer.Tracer;
          const span = vi.fn(tracer.span.bind(tracer));
          const request = operation.run(client);
          expect(span).not.toHaveBeenCalled();
          expect(
            yield* Effect.all([request, request]).pipe(
              Effect.withSpan("caller"),
              Effect.withTracer(Tracer.make({ span })),
            ),
          ).toEqual([42, 42]);
          expect(span.mock.calls.map(([options]) => options.name)).toEqual([
            "caller",
            `HttpClient.${operation.name}`,
            `HttpClient.${operation.name}`,
          ]);
          const [parent, ...children] = span.mock.results.map(
            (result) => result.value,
          );
          for (const child of children) {
            expect(Option.getOrThrow(child.parent)).toBe(parent);
            assert(child.status._tag === "Ended");
            expect(Exit.isSuccess(child.status.exit)).toBe(true);
          }
          expect(children[0]).not.toBe(children[1]);
        }).pipe(Effect.provide(clientLayer)),
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
          expect(span.mock.calls.map(([options]) => options.name)).toEqual([
            `HttpClient.${operation.name}`,
          ]);
          const child = span.mock.results[0]?.value;
          assert(child !== undefined);
          assert(child.status._tag === "Ended");
          expect(Exit.isFailure(child.status.exit)).toBe(true);
          assert(Result.isFailure(typed));
          expect(typed.failure).toEqual(new MissingValue({ caseId: "echo" }));
          const unknown = yield* Effect.result(
            operation.run(client, "unknown"),
          );
          assert(Result.isFailure(unknown));
          expect(unknown.failure).toBeInstanceOf(HttpClient.HttpClientError);
        }).pipe(Effect.provide(clientLayer)),
    );

    it.effect("supports omitted arguments for all request types", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const returns = () => Schema.FiniteFromString;
        expect(
          yield* client.query(
            Ref.make(
              "clients",
              FunctionSpec.publicQuery({ name: "echoQuery", returns }),
            ),
          ),
        ).toBe(0);
        expect(
          yield* client.mutation(
            Ref.make(
              "clients",
              FunctionSpec.publicMutation({ name: "echoMutation", returns }),
            ),
          ),
        ).toBe(0);
        expect(
          yield* client.action(
            Ref.make(
              "clients",
              FunctionSpec.publicAction({ name: "echoAction", returns }),
            ),
          ),
        ).toBe(0);
      }).pipe(Effect.provide(clientLayer)),
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
        assert(Result.isFailure(encoding));
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
        assert(Result.isFailure(decoding));
        expect(decoding.failure).toBeInstanceOf(Schema.SchemaError);
      }).pipe(Effect.provide(clientLayer)),
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
        expect(yield* client.query(refs.public.clients.read, { caseId })).toBe(
          "before",
        );
        yield* request;
        expect(yield* client.query(refs.public.clients.read, { caseId })).toBe(
          "after",
        );
        yield* client.mutation(refs.public.clients.write, {
          caseId,
          value: null,
        });
      }).pipe(Effect.provide(clientLayer)),
    );

    it.effect(
      "exposes the URL and applies auth changes only when executed",
      () =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const { client: backend } = yield* LocalBackend.LocalBackend;
          expect(client.url).toBe(backend.url);
          const setAuth = client.setAuth("invalid-token");
          expect(yield* client.query(query, { value: 42 })).toBe(42);

          yield* setAuth;
          const clearAuth = client.clearAuth;
          const rejected = yield* Effect.result(
            client.query(query, { value: 42 }),
          );
          assert(Result.isFailure(rejected));
          expect(rejected.failure).toBeInstanceOf(HttpClient.HttpClientError);

          yield* clearAuth;
          expect(yield* client.query(query, { value: 42 })).toBe(42);
        }).pipe(Effect.provide(clientLayer)),
    );
  },
);
