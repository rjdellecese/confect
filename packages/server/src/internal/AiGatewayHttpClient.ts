import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type { Service } from "./AiGatewayServiceToken";

export const withServiceToken = (serviceToken: Service) =>
  HttpClient.mapRequestEffect((request) =>
    serviceToken.get("ai-gateway").pipe(
      Effect.map((token) => HttpClientRequest.bearerToken(request, token)),
      Effect.mapError(
        (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause,
              description: cause.message,
            }),
          }),
      ),
    ),
  );
