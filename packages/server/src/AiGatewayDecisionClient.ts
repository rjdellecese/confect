import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as InternalAiGatewayDecisionClient from "./internal/AiGatewayDecisionClient";
import {
  AiGatewayServiceToken,
  type AiGatewayError,
} from "./internal/AiGatewayServiceToken";

export {
  AiGatewayDisabled,
  AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * The OpenRouter-compatible client configured for Convex AI gateway decisions.
 */
export const AiGatewayDecisionClient = OpenRouterClient.OpenRouterClient;
export type AiGatewayDecisionClient = OpenRouterClient.OpenRouterClient;

/**
 * Construct a decision client using the current Effect HTTP client.
 *
 * Acquires a short-lived Convex service token when constructed, failing with
 * `AiGatewayDisabled` or `AiGatewayUnavailable` when the gateway is
 * unavailable.
 */
export const make: Effect.Effect<
  OpenRouterClient.Service,
  AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayDecisionClient.make.pipe(
  Effect.provide(AiGatewayServiceToken.layer),
);

/**
 * Provide the AI gateway decision client using the current Effect HTTP client.
 */
export const layer: Layer.Layer<
  AiGatewayDecisionClient,
  AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayDecisionClient.layer.pipe(
  Layer.provide(AiGatewayServiceToken.layer),
);
