import * as Result from "effect/Result";
import * as Arr from "effect/Array";
import {
  AiGatewayLanguageClient,
  AiGatewayLanguageModel,
} from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/ai/LanguageModel";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as InternalAiGatewayLanguageClient from "../src/internal/AiGatewayLanguageClient";
import {
  AiGatewayServiceToken,
  type Service as AiGatewayServiceTokenService,
} from "../src/internal/AiGatewayServiceToken";

interface TestAiGatewayService extends AiGatewayServiceTokenService {
  readonly requests: Effect.Effect<
    ReadonlyArray<HttpClientRequest.HttpClientRequest>
  >;
  readonly serviceTokenCalls: Effect.Effect<ReadonlyArray<"ai-gateway">>;
}

class TestAiGateway extends Context.Service<
  TestAiGateway,
  TestAiGatewayService
>()("@confect/server/test/AiGatewayLanguageModel.test/TestAiGateway") {}

interface TestAiGatewayOptions {
  readonly getServiceToken: AiGatewayServiceTokenService["get"];
  readonly respond: (
    request: HttpClientRequest.HttpClientRequest,
  ) => HttpClientResponse.HttpClientResponse;
}

const testAiGatewayLayer = (options: TestAiGatewayOptions) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const requests = yield* Ref.make<
        ReadonlyArray<HttpClientRequest.HttpClientRequest>
      >([]);
      const serviceTokenCalls = yield* Ref.make<ReadonlyArray<"ai-gateway">>(
        [],
      );

      const gateway = TestAiGateway.of({
        get: (service) =>
          Ref.update(serviceTokenCalls, (calls) => [...calls, service]).pipe(
            Effect.andThen(options.getServiceToken(service)),
          ),
        requests: Ref.get(requests),
        serviceTokenCalls: Ref.get(serviceTokenCalls),
      });
      const httpClient = HttpClient.make((request) =>
        Ref.update(requests, (captured) => [...captured, request]).pipe(
          Effect.andThen(Effect.sync(() => options.respond(request))),
        ),
      );

      return Context.empty().pipe(
        Context.add(HttpClient.HttpClient, httpClient),
        Context.add(AiGatewayServiceToken, gateway),
        Context.add(TestAiGateway, gateway),
      );
    }),
  );

const languageModelLayer = (modelId: string) =>
  AiGatewayLanguageModel.model(modelId).pipe(
    Layer.provide(InternalAiGatewayLanguageClient.layer),
  );

const testLanguageModelLayer = (
  modelId: string,
  options: TestAiGatewayOptions,
) =>
  languageModelLayer(modelId).pipe(
    Layer.provideMerge(testAiGatewayLayer(options)),
  );

describe("AiGatewayLanguageModel", () => {
  it.layer(
    testLanguageModelLayer("anthropic/claude-sonnet-4.5", {
      getServiceToken: () => Effect.succeed("service-token"),
      respond: (request) =>
        jsonResponse(request, {
          id: "chatcmpl_test",
          object: "chat.completion",
          model: "anthropic/claude-sonnet-4.5",
          created: 1,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "Hello from Convex" },
            },
          ],
        }),
    }),
  )((test) => {
    test.effect("authenticates and generates text through the gateway", () =>
      Effect.gen(function* () {
        const gateway = yield* TestAiGateway;
        const result = yield* LanguageModel.generateText({ prompt: "hello" });

        assert.strictEqual(result.text, "Hello from Convex");
        const serviceTokenCallsResult = yield* gateway.serviceTokenCalls;
        assert.deepStrictEqual(serviceTokenCallsResult, [
          "ai-gateway",
          "ai-gateway",
        ]);

        const requests = yield* gateway.requests;
        assert.strictEqual(requests.length, 1);
        const [request] = requests;
        assert.isDefined(request);
        if (request === undefined) {
          return;
        }

        assert.strictEqual(
          request.url,
          "https://ai-gateway.convex.dev/v1/chat/completions",
        );
        assert.strictEqual(
          request.headers.authorization,
          "Bearer service-token",
        );
        const requestBodyResult = yield* requestBody(request);
        assert.deepStrictEqual(requestBodyResult, {
          model: "anthropic/claude-sonnet-4.5",
          messages: [{ role: "user", content: "hello" }],
        });
      }),
    );
  });

  it.layer(
    testLanguageModelLayer("openai/gpt-4o-mini", {
      getServiceToken: () => Effect.succeed("stream-token"),
      respond: (request) =>
        sseResponse(request, [
          {
            id: "chatcmpl_stream",
            object: "chat.completion.chunk",
            model: "openai/gpt-4o-mini",
            created: 1,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "Hello" },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl_stream",
            object: "chat.completion.chunk",
            model: "openai/gpt-4o-mini",
            created: 1,
            choices: [
              {
                index: 0,
                delta: { content: " world" },
                finish_reason: "stop",
              },
            ],
          },
          "[DONE]",
        ]),
    }),
  )((test) => {
    test.effect("streams text through the gateway", () =>
      Effect.gen(function* () {
        const gateway = yield* TestAiGateway;
        const partsChunk = yield* LanguageModel.streamText({
          prompt: "hello",
        }).pipe(Stream.runCollect);
        const parts = globalThis.Array.from(partsChunk);

        assert.strictEqual(
          Arr.join(
            Arr.map(
              Arr.filter(parts, (part) => part.type === "text-delta"),
              (part) => part.delta,
            ),
            "",
          ),
          "Hello world",
        );
        const serviceTokenCallsResult2 = yield* gateway.serviceTokenCalls;
        assert.deepStrictEqual(serviceTokenCallsResult2, [
          "ai-gateway",
          "ai-gateway",
        ]);
        assert.strictEqual((yield* gateway.requests).length, 1);
      }),
    );
  });

  it.layer(
    testAiGatewayLayer({
      getServiceToken: () =>
        Effect.fail(AiGatewayLanguageClient.AiGatewayDisabled.make()),
      respond: (request) => jsonResponse(request, {}),
    }),
  )((test) => {
    test.effect(
      "does not send a request when service-token acquisition fails",
      () =>
        Effect.gen(function* () {
          const gateway = yield* TestAiGateway;
          const error = yield* Effect.gen(function* () {
            const services = yield* Layer.build(
              languageModelLayer("openai/gpt-4o-mini"),
            );
            return yield* LanguageModel.generateText({
              prompt: "hello",
            }).pipe(Effect.provideContext(services));
          }).pipe(Effect.scoped, Effect.flip);

          assert.instanceOf(error, AiGatewayLanguageClient.AiGatewayDisabled);
          const serviceTokenCallsResult3 = yield* gateway.serviceTokenCalls;
          assert.deepStrictEqual(serviceTokenCallsResult3, ["ai-gateway"]);
          const requestsResult = yield* gateway.requests;
          assert.deepStrictEqual(requestsResult, []);
        }),
    );
  });
});

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown,
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(
      Schema.encodeResult(Schema.fromJsonString(Schema.Unknown))(body).pipe(
        Result.getOrThrow,
      ),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    ),
  );

const sseResponse = (
  request: HttpClientRequest.HttpClientRequest,
  events: ReadonlyArray<unknown>,
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(
      Arr.join(
        Arr.map(events, (event) =>
          event === "[DONE]"
            ? "data: [DONE]\n\n"
            : `data: ${Schema.encodeResult(Schema.fromJsonString(Schema.Unknown))(event).pipe(Result.getOrThrow)}\n\n`,
        ),
        "",
      ),
      {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      },
    ),
  );

const RequestBody = Schema.fromJsonString(
  Schema.Struct({
    model: Schema.String,
    messages: Schema.Array(
      Schema.Struct({ role: Schema.String, content: Schema.String }),
    ),
  }),
);

const requestBody = Effect.fnUntraced(function* (
  request: HttpClientRequest.HttpClientRequest,
) {
  if (request.body._tag !== "Uint8Array") {
    return yield* Effect.die(new Error("Expected a Uint8Array request body"));
  }
  return yield* Schema.decodeEffect(RequestBody)(
    new TextDecoder().decode(request.body.body),
  );
});
