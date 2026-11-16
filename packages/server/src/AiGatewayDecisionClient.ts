import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/http/HttpClient";
import * as InternalAiGatewayDecisionClient from "./internal/AiGatewayDecisionClient";
import * as AiGatewayServiceToken from "./internal/AiGatewayServiceToken";

/**
 * Public gateway availability failures and their schema/union.
 * AiGatewayDisabled describes a plan/setting restriction; AiGatewayUnavailable
 * describes an unsupported deployment. Definitions are shared with the language
 * client and remain public through these aliases, with no extra failure payload
 * fields.
 *
 * @category Errors
 */
export {
  AiGatewayDisabled,
  AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * The client configured for Convex AI gateway decisions.
 *
 * @category Services
 */
export const AiGatewayDecisionClient = OpenRouterClient.OpenRouterClient;
/**
 * Effect requirement of a decision model using the gateway client layer.
 *
 * @category Services
 */
export type AiGatewayDecisionClient = OpenRouterClient.OpenRouterClient;

/**
 * Construct a decision model client using the current Effect HTTP client.
 *
 * @internal
 */
export const make: Effect.Effect<
  OpenRouterClient.Service,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayDecisionClient.make.pipe(
  Effect.provideService(
    AiGatewayServiceToken.AiGatewayServiceToken,
    AiGatewayServiceToken.service,
  ),
);

/**
 * Provide the AI gateway decision client using the current Effect HTTP client.
 *
 * Requires an Effect HttpClient and a running Convex action. Construction may
 * fail with AiGatewayDisabled or AiGatewayUnavailable; later token failures
 * follow the model/HTTP client's error contract.
 *
 * This layer supplies the client for AiGatewayDecisionModel operations; it is a
 * value, not a layer factory.
 *
 * @category Layers
 */
export const layer: Layer.Layer<
  AiGatewayDecisionClient,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayDecisionClient.layer.pipe(
  Layer.provide(AiGatewayServiceToken.layer),
);
