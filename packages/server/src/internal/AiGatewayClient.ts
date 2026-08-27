import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import {
  AiGatewayServiceToken,
  type AiGatewayServiceTokenError,
  type Service as AiGatewayServiceTokenService,
} from "./AiGatewayServiceToken";

const API_URL = "https://ai-gateway.convex.dev/v1";

const describeTokenError = (error: AiGatewayServiceTokenError): string =>
  error.cause instanceof Error
    ? `Failed to get a Convex AI gateway service token: ${error.cause.message}`
    : "Failed to get a Convex AI gateway service token";

const withServiceToken = (serviceToken: AiGatewayServiceTokenService) =>
  HttpClient.mapRequestEffect((request) =>
    serviceToken.get("ai-gateway").pipe(
      Effect.mapError(
        (error) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause: error.cause,
              description: describeTokenError(error),
            }),
          }),
      ),
      Effect.map((token) => HttpClientRequest.bearerToken(token)(request)),
    ),
  );

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken;
  return yield* OpenAiClient.make({
    apiUrl: API_URL,
    transformClient: withServiceToken(serviceToken),
  });
});

export const layer = Layer.effect(OpenAiClient.OpenAiClient, make);
