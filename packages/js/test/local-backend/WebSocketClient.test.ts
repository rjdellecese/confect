import { FunctionSpec, Ref } from "@confect/core";
import * as WebSocketClient from "@confect/js/WebSocketClient";
import { assert, expect, layer } from "@effect/vitest";
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
const read = Ref.make(
  "clients",
  FunctionSpec.publicQuery({
    name: "read",
    args: () => ({ caseId: Schema.String }),
    returns: () => Schema.FiniteFromString,
    error: () => MissingValue,
  }),
);
const write = Ref.make(
  "clients",
  FunctionSpec.publicMutation({
    name: "write",
    args: () => ({
      caseId: Schema.String,
      value: Schema.NullOr(Schema.String),
    }),
    returns: () => Schema.Null,
  }),
);

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
    ) => client.query(query, { value: 42, ...(failure ? { failure } : {}) }),
  },
  {
    name: "mutation",
    run: (
      client: WebSocketClient.WebSocketClient,
      failure?: "typed" | "unknown",
    ) =>
      client.mutation(mutation, { value: 42, ...(failure ? { failure } : {}) }),
  },
  {
    name: "action",
    run: (
      client: WebSocketClient.WebSocketClient,
      failure?: "typed" | "unknown",
    ) => client.action(action, { value: 42, ...(failure ? { failure } : {}) }),
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
  (it) => {
    it.effect.each(operations)(
      "$name encodes arguments, decodes results, and traces each execution",
      (operation) =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
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
            `WebSocketClient.${operation.name}`,
            `WebSocketClient.${operation.name}`,
          ]);
        }).pipe(Effect.provide(clientLayer)),
    );

    it.effect.each(operations)(
      "$name distinguishes declared errors from unknown backend errors",
      (operation) =>
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const typed = yield* Effect.result(operation.run(client, "typed"));
          assert(Result.isFailure(typed));
          expect(typed.failure).toEqual(new MissingValue({ caseId: "echo" }));
          const unknown = yield* Effect.result(
            operation.run(client, "unknown"),
          );
          assert(Result.isFailure(unknown));
          expect(unknown.failure).toBeInstanceOf(
            WebSocketClient.WebSocketClientError,
          );
        }).pipe(Effect.provide(clientLayer)),
    );

    it.effect("supports omitted arguments for all request types", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
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
        const client = yield* WebSocketClient.WebSocketClient;
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
          assert(Result.isFailure(missing));
          expect(missing.failure).toEqual(new MissingValue({ caseId }));

          yield* client.mutation(write, { caseId, value: "42" });
          expect(yield* Queue.take(updates)).toEqual(Result.succeed(42));
          yield* client.mutation(write, { caseId, value: "not a number" });
          const malformed = yield* Queue.take(updates);
          assert(Result.isFailure(malformed));
          expect(malformed.failure).toBeInstanceOf(Schema.SchemaError);
          yield* client.mutation(write, { caseId, value: "43" });
          expect(yield* Queue.take(updates)).toEqual(Result.succeed(43));
          yield* Fiber.join(subscription);
          yield* client.mutation(write, { caseId, value: null });
        }).pipe(Effect.provide(clientLayer)),
    );

    it.effect("fails reactiveQuery on a declared backend error", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const caseId = "websocket-missing";
        yield* client.mutation(write, { caseId, value: null });
        const result = yield* client
          .reactiveQuery(read, { caseId })
          .pipe(Stream.runCollect, Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toEqual(new MissingValue({ caseId }));
      }).pipe(Effect.provide(clientLayer)),
    );

    it.effect("wraps undeclared subscription errors", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const result = yield* client
          .reactiveQuery(query, { value: 42, failure: "unknown" })
          .pipe(Stream.runCollect, Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(
          WebSocketClient.WebSocketClientError,
        );
      }).pipe(Effect.provide(clientLayer)),
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
        expect(yield* Queue.size(calls)).toBe(0);
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
          expect(yield* Queue.take(calls)).toEqual({
            registration,
            refresh: false,
          });
          expect(yield* Queue.take(calls)).toEqual({
            registration,
            refresh: true,
          });
          expect(yield* Queue.take(changes)).toBe(false);
          expect(yield* client.query(query, { value: 42 })).toBe(42);
        }
      }).pipe(Effect.provide(clientLayer)),
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
          const client = yield* WebSocketClient.WebSocketClient;
          expect(yield* client.query(query, { value: 42 })).toBe(42);
          expect(sockets.length).toBeGreaterThan(0);
          expect(sockets.at(-1)?.readyState).toBe(WebSocket.OPEN);
        }).pipe(
          Effect.provide(
            WebSocketClient.layer(backend.url, {
              webSocketConstructor: ObservedWebSocket,
              logger: false,
            }),
          ),
        );
        expect(
          sockets.every((socket) => socket.readyState === WebSocket.CLOSED),
        ).toBe(true);
      }),
    );
  },
);
