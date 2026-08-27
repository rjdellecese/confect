import { AiGatewayError, AiGatewayLanguageModel } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
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

describe("AiGatewayLanguageModel", () => {
  it.effect("authenticates and generates text through the gateway", () =>
    Effect.gen(function* () {
      const gateway = yield* makeTestGateway({
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
      });

      const result = yield* LanguageModel.generateText({
        prompt: "hello",
      }).pipe(
        Effect.provide(
          languageModelLayer(
            "anthropic/claude-sonnet-4.5",
            gateway.dependencies,
          ),
        ),
      );

      assert.strictEqual(result.text, "Hello from Convex");
      assert.deepStrictEqual(yield* gateway.serviceTokenCalls(), [
        "ai-gateway",
      ]);

      const requests = yield* gateway.requests();
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
      assert.strictEqual(request.headers.authorization, "Bearer service-token");
      assert.deepStrictEqual(yield* requestBody(request), {
        model: "anthropic/claude-sonnet-4.5",
        messages: [{ role: "user", content: "hello" }],
      });
    }),
  );

  it.effect("streams text through the gateway", () =>
    Effect.gen(function* () {
      const gateway = yield* makeTestGateway({
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
      });

      const partsChunk = yield* LanguageModel.streamText({
        prompt: "hello",
      }).pipe(
        Stream.runCollect,
        Effect.provide(
          languageModelLayer("openai/gpt-4o-mini", gateway.dependencies),
        ),
      );
      const parts = globalThis.Array.from(partsChunk);

      assert.strictEqual(
        parts
          .filter((part) => part.type === "text-delta")
          .map((part) => part.delta)
          .join(""),
        "Hello world",
      );
      assert.deepStrictEqual(yield* gateway.serviceTokenCalls(), [
        "ai-gateway",
      ]);
      assert.strictEqual((yield* gateway.requests()).length, 1);
    }),
  );

  it.effect(
    "does not send a request when service-token acquisition fails",
    () =>
      Effect.gen(function* () {
        const gateway = yield* makeTestGateway({
          getServiceToken: () =>
            Effect.fail(new AiGatewayError.AiGatewayDisabled()),
          respond: (request) => jsonResponse(request, {}),
        });

        const error = yield* LanguageModel.generateText({
          prompt: "hello",
        }).pipe(
          Effect.provide(
            languageModelLayer("openai/gpt-4o-mini", gateway.dependencies),
          ),
          Effect.flip,
        );

        assert.instanceOf(error, AiGatewayError.AiGatewayDisabled);
        assert.deepStrictEqual(yield* gateway.serviceTokenCalls(), [
          "ai-gateway",
        ]);
        assert.deepStrictEqual(yield* gateway.requests(), []);
      }),
  );
});

interface TestGatewayOptions {
  readonly getServiceToken: AiGatewayServiceTokenService["get"];
  readonly respond: (
    request: HttpClientRequest.HttpClientRequest,
  ) => HttpClientResponse.HttpClientResponse;
}

const makeTestGateway = (options: TestGatewayOptions) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<
      ReadonlyArray<HttpClientRequest.HttpClientRequest>
    >([]);
    const serviceTokenCalls = yield* Ref.make<ReadonlyArray<"ai-gateway">>([]);

    const httpClient = HttpClient.make((request) =>
      Ref.update(requests, (captured) => [...captured, request]).pipe(
        Effect.andThen(Effect.sync(() => options.respond(request))),
      ),
    );
    const serviceToken = AiGatewayServiceToken.of({
      get: (service) =>
        Ref.update(serviceTokenCalls, (calls) => [...calls, service]).pipe(
          Effect.andThen(options.getServiceToken(service)),
        ),
    });

    return {
      dependencies: Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, httpClient),
        Layer.succeed(AiGatewayServiceToken, serviceToken),
      ),
      requests: () => Ref.get(requests),
      serviceTokenCalls: () => Ref.get(serviceTokenCalls),
    } as const;
  });

const clientLayer = (
  dependencies: Layer.Layer<HttpClient.HttpClient | AiGatewayServiceToken>,
) => InternalAiGatewayClient.layer.pipe(Layer.provide(dependencies));

const languageModelLayer = (
  modelId: string,
  dependencies: Layer.Layer<HttpClient.HttpClient | AiGatewayServiceToken>,
) =>
  AiGatewayLanguageModel.model(modelId).pipe(
    Layer.provide(clientLayer(dependencies)),
  );

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

const requestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    if (request.body._tag !== "Uint8Array") {
      return yield* Effect.die(new Error("Expected a Uint8Array request body"));
    }
    return JSON.parse(new TextDecoder().decode(request.body.body));
  });
