import { AiGatewayClient, AiGatewayLanguageModel } from "@confect/server";
import { assert, beforeEach, describe, it } from "@effect/vitest";
import * as ConvexServer from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { vi } from "vitest";

vi.mock("convex/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexServer>()),
  getServiceToken: vi.fn(),
}));

const getServiceTokenMock = vi.mocked(ConvexServer.getServiceToken);

beforeEach(() => {
  getServiceTokenMock.mockReset();
});

describe("AiGatewayLanguageModel", () => {
  it.effect("authenticates and generates text through the gateway", () =>
    Effect.gen(function* () {
      getServiceTokenMock.mockResolvedValue("service-token");

      let capturedRequest: HttpClientRequest.HttpClientRequest | undefined;
      const httpClient = HttpClient.make((request) => {
        capturedRequest = request;
        return Effect.succeed(
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
        );
      });

      const result = yield* LanguageModel.generateText({
        prompt: "hello",
      }).pipe(
        Effect.provide(
          languageModelLayer("anthropic/claude-sonnet-4.5", httpClient),
        ),
      );

      assert.strictEqual(result.text, "Hello from Convex");
      assert.deepStrictEqual(getServiceTokenMock.mock.calls, [["ai-gateway"]]);
      assert.isDefined(capturedRequest);
      if (capturedRequest === undefined) {
        return;
      }

      assert.strictEqual(
        capturedRequest.url,
        "https://ai-gateway.convex.dev/v1/chat/completions",
      );
      assert.strictEqual(
        capturedRequest.headers.authorization,
        "Bearer service-token",
      );
      assert.deepStrictEqual(yield* requestBody(capturedRequest), {
        model: "anthropic/claude-sonnet-4.5",
        messages: [{ role: "user", content: "hello" }],
      });
    }),
  );

  it.effect("streams text through the gateway", () =>
    Effect.gen(function* () {
      getServiceTokenMock.mockResolvedValue("stream-token");

      const httpClient = HttpClient.make((request) =>
        Effect.succeed(
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
        ),
      );

      const partsChunk = yield* LanguageModel.streamText({
        prompt: "hello",
      }).pipe(
        Stream.runCollect,
        Effect.provide(languageModelLayer("openai/gpt-4o-mini", httpClient)),
      );
      const parts = globalThis.Array.from(partsChunk);

      assert.strictEqual(
        parts
          .filter((part) => part.type === "text-delta")
          .map((part) => part.delta)
          .join(""),
        "Hello world",
      );
      assert.deepStrictEqual(getServiceTokenMock.mock.calls, [["ai-gateway"]]);
    }),
  );

  it.effect("maps service-token failures to Effect AI errors", () =>
    Effect.gen(function* () {
      getServiceTokenMock.mockRejectedValue(new Error("AiGatewayUnavailable"));

      let requestSent = false;
      const httpClient = HttpClient.make((request) => {
        requestSent = true;
        return Effect.succeed(jsonResponse(request, {}));
      });

      const error = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
        Effect.provide(languageModelLayer("openai/gpt-4o-mini", httpClient)),
        Effect.flip,
      );

      assert.isTrue(AiError.isAiError(error));
      assert.strictEqual(error.reason._tag, "NetworkError");
      if (error.reason._tag === "NetworkError") {
        assert.match(
          error.reason.description ?? "",
          /service token: AiGatewayUnavailable/,
        );
      }
      assert.isFalse(requestSent);
    }),
  );
});

const clientLayer = (httpClient: HttpClient.HttpClient) =>
  AiGatewayClient.layer.pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
  );

const languageModelLayer = (
  modelId: string,
  httpClient: HttpClient.HttpClient,
) =>
  AiGatewayLanguageModel.model(modelId).pipe(
    Layer.provide(clientLayer(httpClient)),
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
