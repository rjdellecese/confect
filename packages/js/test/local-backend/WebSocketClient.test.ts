import * as Arr from "effect/Array";
import { FunctionSpec, Ref } from "@confect/core";
import * as WebSocketClient from "@confect/js/WebSocketClient";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";
import { vi } from "vitest";
import * as LocalBackend from "confect-local-backend/LocalBackend";

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
const query = Ref.make({
  namespace: "clients",
  spec: FunctionSpec.publicQuery({
    ...echoDefinition,
    name: "echoQuery",
  }),
});
const mutation = Ref.make({
  namespace: "clients",
  spec: FunctionSpec.publicMutation({
    ...echoDefinition,
    name: "echoMutation",
  }),
});
const action = Ref.make({
  namespace: "clients",
  spec: FunctionSpec.publicAction({
    ...echoDefinition,
    name: "echoAction",
  }),
});
const read = Ref.make({
  namespace: "clients",
  spec: FunctionSpec.publicQuery({
    name: "read",
    args: () => ({ caseId: Schema.String }),
    returns: () => Schema.FiniteFromString,
    error: () => MissingValue,
  }),
});
const write = Ref.make({
  namespace: "clients",
  spec: FunctionSpec.publicMutation({
    name: "write",
    args: () => ({
      caseId: Schema.String,
      value: Schema.NullOr(Schema.String),
    }),
    returns: () => Schema.Null,
  }),
});

const clientLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { client } = yield* LocalBackend.LocalBackend;
    return WebSocketClient.layer(client.url, { logger: false });
  }),
);

const operations = [
  {
    name: "query",
    run: (
      client: WebSocketClient.WebSocketClient,
      failure?: "typed" | "unknown",
    ) =>
      client.query(query, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
  {
    name: "mutation",
    run: (
      client: WebSocketClient.WebSocketClient,
      failure?: "typed" | "unknown",
    ) =>
      client.mutation(mutation, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
  {
    name: "action",
    run: (
      client: WebSocketClient.WebSocketClient,
      failure?: "typed" | "unknown",
    ) =>
      client.action(action, {
        value: 42,
        ...(failure !== undefined ? { failure } : {}),
      }),
  },
];

class TokenProvider extends Context.Service<
  TokenProvider,
  {
    readonly fetch: (refresh: boolean) => Effect.Effect<null | undefined>;
  }
>()("@confect/js/test/local-backend/WebSocketClient.test/TokenProvider") {}

class AuthObserver extends Context.Service<
  AuthObserver,
  {
    readonly notify: (authenticated: boolean) => Effect.Effect<void>;
  }
>()("@confect/js/test/local-backend/WebSocketClient.test/AuthObserver") {}

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "WebSocketClient against Convex",
  (backendIt) => {
    backendIt.layer(clientLayer, { buildPerTest: true })((it) => {
      it.effect.each(operations)(
        "$name encodes arguments, decodes results, and traces each execution",
        (operation) =>
          Effect.gen(function* () {
            const client = yield* WebSocketClient.WebSocketClient;
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
              Arr.map(span.mock.calls, ([options]) => options.name),
            ).toEqual([
              "caller",
              `WebSocketClient.${operation.name}`,
              `WebSocketClient.${operation.name}`,
            ]);
          }),
      );

      it.effect.each(operations)(
        "$name distinguishes declared errors from unknown backend errors",
        (operation) =>
          Effect.gen(function* () {
            const client = yield* WebSocketClient.WebSocketClient;
            const typed = yield* Effect.result(operation.run(client, "typed"));
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
            expect(unknown.failure).toBeInstanceOf(
              WebSocketClient.WebSocketClientError,
            );
          }),
      );

      it.effect("supports omitted arguments for all request types", () =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const returns = () => Schema.FiniteFromString;
          const noArgsQueryRef = Ref.make({
            namespace: "clients",
            spec: FunctionSpec.publicQuery({ name: "echoQuery", returns }),
          });
          const noArgsMutationRef = Ref.make({
            namespace: "clients",
            spec: FunctionSpec.publicMutation({
              name: "echoMutation",
              returns,
            }),
          });
          const noArgsActionRef = Ref.make({
            namespace: "clients",
            spec: FunctionSpec.publicAction({ name: "echoAction", returns }),
          });
          type NoArgsRef =
            | typeof noArgsQueryRef
            | typeof noArgsMutationRef
            | typeof noArgsActionRef;
          expectTypeOf<Ref.Error<NoArgsRef>>().toEqualTypeOf<never>();
          expectTypeOf<Ref.Returns<NoArgsRef>>().toEqualTypeOf<number>();
          const observed2 = yield* client.query(
            Ref.make({
              namespace: "clients",
              spec: FunctionSpec.publicQuery({ name: "echoQuery", returns }),
            }),
          );
          expect(observed2).toBe(0);
          const observed3 = yield* client.mutation(
            Ref.make({
              namespace: "clients",
              spec: FunctionSpec.publicMutation({
                name: "echoMutation",
                returns,
              }),
            }),
          );
          expect(observed3).toBe(0);
          const observed4 = yield* client.action(
            Ref.make({
              namespace: "clients",
              spec: FunctionSpec.publicAction({ name: "echoAction", returns }),
            }),
          );
          expect(observed4).toBe(0);
        }),
      );

      it.effect("reports argument and return codec failures", () =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const invalidArgs = Ref.make({
            namespace: "clients",
            spec: FunctionSpec.publicQuery({
              name: "echoQuery",
              args: () => ({ value: Schema.String.check(Schema.isNonEmpty()) }),
              returns: () => Schema.String,
            }),
          });
          const encoding = yield* Effect.result(
            client.query(invalidArgs, { value: "" }),
          );
          const encodingIsFailure = Result.isFailure(encoding);
          assert(encodingIsFailure);
          expect(encoding.failure).toBeInstanceOf(Schema.SchemaError);
          const invalidReturns = Ref.make({
            namespace: "clients",
            spec: FunctionSpec.publicQuery({
              name: "echoQuery",
              args: () => ({ value: Schema.String }),
              returns: () => Schema.FiniteFromString,
            }),
          });
          const decoding = yield* Effect.result(
            client.query(invalidReturns, { value: "not a number" }),
          );
          const decodingIsFailure = Result.isFailure(decoding);
          assert(decodingIsFailure);
          expect(decoding.failure).toBeInstanceOf(Schema.SchemaError);
        }),
      );

      it.effect(
        "keeps a subscription alive across backend and decoding errors",
        () =>
          Effect.gen(function* () {
            const client = yield* WebSocketClient.WebSocketClient;
            const caseId = "websocket-recovery";
            yield* client.mutation(write, { caseId, value: null });
            const updates =
              yield* Queue.unbounded<
                Result.Result<
                  number,
                  | MissingValue
                  | WebSocketClient.WebSocketClientError
                  | Schema.SchemaError
                >
              >();
            const subscription = yield* client
              .reactiveQueryResult(read, { caseId })
              .pipe(
                Stream.take(4),
                Stream.runForEach((result) => Queue.offer(updates, result)),
                Effect.forkChild,
              );
            const missing = yield* Queue.take(updates);
            const missingIsFailure = Result.isFailure(missing);
            assert(missingIsFailure);
            expect(missing.failure).toEqual(MissingValue.make({ caseId }));

            yield* client.mutation(write, { caseId, value: "42" });
            const observed5 = yield* Queue.take(updates);
            expect(observed5).toEqual(Result.succeed(42));
            yield* client.mutation(write, { caseId, value: "not a number" });
            const malformed = yield* Queue.take(updates);
            const malformedIsFailure = Result.isFailure(malformed);
            assert(malformedIsFailure);
            expect(malformed.failure).toBeInstanceOf(Schema.SchemaError);
            yield* client.mutation(write, { caseId, value: "43" });
            const observed6 = yield* Queue.take(updates);
            expect(observed6).toEqual(Result.succeed(43));
            yield* Fiber.join(subscription);
            yield* client.mutation(write, { caseId, value: null });
          }),
      );

      it.effect("fails reactiveQuery on a declared backend error", () =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const caseId = "websocket-missing";
          yield* client.mutation(write, { caseId, value: null });
          const result = yield* client
            .reactiveQuery(read, { caseId })
            .pipe(Stream.runCollect, Effect.result);
          const resultIsFailure = Result.isFailure(result);
          assert(resultIsFailure);
          expect(result.failure).toEqual(MissingValue.make({ caseId }));
        }),
      );

      it.effect("wraps undeclared subscription errors", () =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const result = yield* client
            .reactiveQuery(query, { value: 42, failure: "unknown" })
            .pipe(Stream.runCollect, Effect.result);
          const resultIsFailure = Result.isFailure(result);
          assert(resultIsFailure);
          expect(result.failure).toBeInstanceOf(
            WebSocketClient.WebSocketClientError,
          );
        }),
      );

      it.effect("captures auth callback services for each registration", () =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const calls = yield* Queue.unbounded<{
            registration: number;
            refresh: boolean;
          }>();
          const changes = yield* Queue.unbounded<boolean>();
          const register = client.setAuth(
            ({ forceRefreshToken }) =>
              Effect.flatMap(TokenProvider, (tokens) =>
                tokens.fetch(forceRefreshToken),
              ),
            (authenticated) =>
              Effect.flatMap(AuthObserver, (observer) =>
                observer.notify(authenticated),
              ),
          );
          const observed7 = yield* Queue.size(calls);
          expect(observed7).toBe(0);
          for (const registration of [1, 2]) {
            yield* register.pipe(
              Effect.provideService(TokenProvider, {
                fetch: (refresh) =>
                  Queue.offer(calls, { registration, refresh }).pipe(
                    Effect.as(registration === 1 ? null : undefined),
                  ),
              }),
              Effect.provideService(AuthObserver, {
                notify: (authenticated) =>
                  Queue.offer(changes, authenticated).pipe(Effect.asVoid),
              }),
            );
            const observed8 = yield* Queue.take(calls);
            expect(observed8).toEqual({
              registration,
              refresh: false,
            });
            const observed9 = yield* Queue.take(calls);
            expect(observed9).toEqual({
              registration,
              refresh: true,
            });
            const observed10 = yield* Queue.take(changes);
            expect(observed10).toBe(false);
            const observed11 = yield* client.query(query, { value: 42 });
            expect(observed11).toBe(42);
          }
        }),
      );

      it.effect("closes the real WebSocket when the layer's scope ends", () =>
        Effect.gen(function* () {
          const { client: backend } = yield* LocalBackend.LocalBackend;
          const sockets: Array<WebSocket> = [];
          class ObservedWebSocket extends WebSocket {
            constructor(url: string | URL, protocols?: string | Array<string>) {
              super(url, protocols);
              sockets.push(this);
            }
          }
          yield* Effect.gen(function* () {
            const services = yield* Layer.build(
              WebSocketClient.layer(backend.url, {
                webSocketConstructor: ObservedWebSocket,
                logger: false,
              }),
            );
            const client = Context.get(
              services,
              WebSocketClient.WebSocketClient,
            );
            const observed12 = yield* client.query(query, { value: 42 });
            expect(observed12).toBe(42);
            expect(sockets.length).toBeGreaterThan(0);
            expect(sockets.at(-1)?.readyState).toBe(WebSocket.OPEN);
          }).pipe(Effect.scoped);
          expect(
            Arr.every(
              sockets,
              (socket) => socket.readyState === WebSocket.CLOSED,
            ),
          ).toBe(true);
        }),
      );
    });
  },
);
