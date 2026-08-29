import { AiGatewayClient, AiGatewayLanguageModel } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as InternalAiGatewayClient from "../src/internal/AiGatewayClient";
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
    Layer.provide(InternalAiGatewayClient.layer),
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
        assert.deepStrictEqual(yield* gateway.serviceTokenCalls, [
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
        assert.deepStrictEqual(yield* requestBody(request), {
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
          parts
            .filter((part) => part.type === "text-delta")
            .map((part) => part.delta)
            .join(""),
          "Hello world",
        );
        assert.deepStrictEqual(yield* gateway.serviceTokenCalls, [
          "ai-gateway",
        ]);
        assert.strictEqual((yield* gateway.requests).length, 1);
      }),
    );
  });

  it.layer(
    testAiGatewayLayer({
      getServiceToken: () =>
        Effect.fail(new AiGatewayClient.AiGatewayDisabled()),
      respond: (request) => jsonResponse(request, {}),
    }),
  )((test) => {
    test.effect(
      "does not send a request when service-token acquisition fails",
      () =>
        Effect.gen(function* () {
          const gateway = yield* TestAiGateway;
          const error = yield* LanguageModel.generateText({
            prompt: "hello",
          }).pipe(
            Effect.provide(languageModelLayer("openai/gpt-4o-mini")),
            Effect.flip,
          );

          assert.instanceOf(error, AiGatewayClient.AiGatewayDisabled);
          assert.deepStrictEqual(yield* gateway.serviceTokenCalls, [
            "ai-gateway",
          ]);
          assert.deepStrictEqual(yield* gateway.requests, []);
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
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

const sseResponse = (
  request: HttpClientRequest.HttpClientRequest,
  events: ReadonlyArray<unknown>,
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(
      events
        .map((event) =>
          event === "[DONE]"
            ? "data: [DONE]\n\n"
            : `data: ${JSON.stringify(event)}\n\n`,
        )
        .join(""),
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

const requestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    if (request.body._tag !== "Uint8Array") {
      return yield* Effect.die(new Error("Expected a Uint8Array request body"));
    }
    return yield* Schema.decodeEffect(RequestBody)(
      new TextDecoder().decode(request.body.body),
    );
  });
