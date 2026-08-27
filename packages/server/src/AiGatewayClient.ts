import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import { getServiceToken } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

const apiUrl = "https://ai-gateway.convex.dev/v1";

const describeTokenError = (cause: unknown): string =>
  cause instanceof Error
    ? `Failed to get a Convex AI gateway service token: ${cause.message}`
    : "Failed to get a Convex AI gateway service token";

const withServiceToken = HttpClient.mapRequestEffect((request) =>
  Effect.tryPromise({
    try: () => getServiceToken("ai-gateway"),
    catch: (cause) =>
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause,
          description: describeTokenError(cause),
        }),
      }),
  }).pipe(Effect.map((token) => HttpClientRequest.bearerToken(token)(request))),
);

/**
 * The OpenAI-compatible client service configured for the Convex AI gateway.
 */
export const AiGatewayClient = OpenAiClient.OpenAiClient;
export type AiGatewayClient = OpenAiClient.OpenAiClient;

/**
 * Construct an AI gateway client using the current Effect HTTP client.
 *
 * The client obtains a short-lived Convex service token for every request.
 * Convex reuses the token within one running action.
 */
export const make: Effect.Effect<
  OpenAiClient.Service,
  never,
  HttpClient.HttpClient
> = OpenAiClient.make({
  apiUrl,
  transformClient: withServiceToken,
});

/**
 * Provide the AI gateway client using the current Effect HTTP client.
 */
export const layer: Layer.Layer<AiGatewayClient, never, HttpClient.HttpClient> =
  Layer.effect(AiGatewayClient, make);
