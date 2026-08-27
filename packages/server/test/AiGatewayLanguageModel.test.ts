import { AiGatewayError, AiGatewayLanguageModel } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as InternalAiGatewayClient from "../src/internal/AiGatewayClient";
import {
  AiGatewayServiceToken,
  make as makeAiGatewayServiceToken,
  type Service as AiGatewayServiceTokenService,
} from "../src/internal/AiGatewayServiceToken";

const CONVEX_AI_GATEWAY_DISABLED_MESSAGE =
  "The Convex AI gateway is not enabled for your team. Upgrade to a paid plan to enable it, or contact support@convex.dev if you believe this is an error.";

const CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE =
  '`getServiceToken("ai-gateway")` isn\'t available on this deployment because the AI gateway is a Convex Cloud service. Deploy to Convex Cloud, or call your model provider directly with your own API key.';

describe("AiGatewayLanguageModel", () => {
  it.effect("authenticates and generates text through the gateway", () =>
    Effect.gen(function* () {
      const serviceTokenCalls: Array<string> = [];
      const serviceToken = makeServiceToken((service) =>
        Effect.sync(() => {
          serviceTokenCalls.push(service);
          return "service-token";
        }),
      );

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
          languageModelLayer(
            "anthropic/claude-sonnet-4.5",
            httpClient,
            serviceToken,
          ),
        ),
      );

      assert.strictEqual(result.text, "Hello from Convex");
      assert.deepStrictEqual(serviceTokenCalls, ["ai-gateway"]);
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
      const serviceTokenCalls: Array<string> = [];
      const serviceToken = makeServiceToken((service) =>
        Effect.sync(() => {
          serviceTokenCalls.push(service);
          return "stream-token";
        }),
      );

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
        Effect.provide(
          languageModelLayer("openai/gpt-4o-mini", httpClient, serviceToken),
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
      assert.deepStrictEqual(serviceTokenCalls, ["ai-gateway"]);
    }),
  );

  it.effect("surfaces a disabled gateway in the default runtime", () =>
    Effect.gen(function* () {
      const { error, requestSent } = yield* getLanguageModelError(
        new Error(CONVEX_AI_GATEWAY_DISABLED_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayError.AiGatewayDisabled);
      assert.strictEqual(
        error.message,
        "The Convex AI gateway is disabled. Your team may be on the free plan, or the gateway may have been disabled for your team. Upgrade to a paid plan, or email support@convex.dev if this looks wrong.",
      );
      assert.isFalse(requestSent);
    }),
  );

  it.effect("surfaces a disabled gateway in the Node runtime", () =>
    Effect.gen(function* () {
      const { error, requestSent } = yield* getLanguageModelError(
        nodeActionCallbackError(
          "Transient error while running create service token",
          "AiGatewayDisabled",
          CONVEX_AI_GATEWAY_DISABLED_MESSAGE,
        ),
      );

      assert.instanceOf(error, AiGatewayError.AiGatewayDisabled);
      assert.isFalse(requestSent);
    }),
  );

  it.effect("surfaces an unavailable gateway in the default runtime", () =>
    Effect.gen(function* () {
      const { error, requestSent } = yield* getLanguageModelError(
        new Error(CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayError.AiGatewayUnavailable);
      assert.strictEqual(
        error.message,
        "The Convex AI gateway is unavailable. This action is running on a local or self-hosted deployment, which cannot use the gateway. Call the model provider directly with your own API key stored in a Convex environment variable.",
      );
      assert.isFalse(requestSent);
    }),
  );

  it.effect("surfaces an unavailable gateway in the Node runtime", () =>
    Effect.gen(function* () {
      const { error, requestSent } = yield* getLanguageModelError(
        nodeActionCallbackError(
          "Invalid create service token request",
          "AiGatewayUnavailable",
          CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE,
        ),
      );

      assert.instanceOf(error, AiGatewayError.AiGatewayUnavailable);
      assert.isFalse(requestSent);
    }),
  );

  it.effect("treats unexpected service-token failures as defects", () =>
    Effect.gen(function* () {
      const unexpected = new Error(
        "NotAiGatewayDisabled is not a documented error code",
      );
      const serviceToken = makeAiGatewayServiceToken(() =>
        Promise.reject(unexpected),
      );

      let requestSent = false;
      const httpClient = HttpClient.make((request) => {
        requestSent = true;
        return Effect.succeed(jsonResponse(request, {}));
      });

      const exit = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
        Effect.provide(
          languageModelLayer("openai/gpt-4o-mini", httpClient, serviceToken),
        ),
        Effect.exit,
      );

      assert.deepStrictEqual(exit, Exit.die(unexpected));
      assert.isFalse(requestSent);
    }),
  );
});

const getLanguageModelError = (cause: unknown) =>
  Effect.gen(function* () {
    const serviceToken = makeAiGatewayServiceToken(() => Promise.reject(cause));

    let requestSent = false;
    const httpClient = HttpClient.make((request) => {
      requestSent = true;
      return Effect.succeed(jsonResponse(request, {}));
    });

    const error = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
      Effect.provide(
        languageModelLayer("openai/gpt-4o-mini", httpClient, serviceToken),
      ),
      Effect.flip,
    );

    return { error, requestSent };
  });

const nodeActionCallbackError = (
  prefix: string,
  code: "AiGatewayDisabled" | "AiGatewayUnavailable",
  message: string,
): Error => new Error(`${prefix}: ${JSON.stringify({ code, message })}`);

const clientLayer = (
  httpClient: HttpClient.HttpClient,
  serviceToken: AiGatewayServiceTokenService,
) =>
  InternalAiGatewayClient.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, httpClient),
        Layer.succeed(AiGatewayServiceToken, serviceToken),
      ),
    ),
  );

const languageModelLayer = (
  modelId: string,
  httpClient: HttpClient.HttpClient,
  serviceToken: AiGatewayServiceTokenService,
) =>
  AiGatewayLanguageModel.model(modelId).pipe(
    Layer.provide(clientLayer(httpClient, serviceToken)),
  );

const makeServiceToken = (
  get: AiGatewayServiceTokenService["get"],
): AiGatewayServiceTokenService => ({ get });

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
