import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as InternalAiGatewayClient from "./internal/AiGatewayClient";
import {
  AiGatewayServiceToken,
  type AiGatewayError,
} from "./internal/AiGatewayServiceToken";

export {
  AiGatewayDisabled,
  type AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * The OpenAI-compatible client service configured for the Convex AI gateway.
 */
export const AiGatewayClient = OpenAiClient.OpenAiClient;
export type AiGatewayClient = OpenAiClient.OpenAiClient;

/**
 * Construct an AI gateway client using the current Effect HTTP client.
 *
 * The client obtains a short-lived Convex service token when it is constructed.
 * Token acquisition fails with `AiGatewayDisabled` or `AiGatewayUnavailable`
 * when the corresponding documented Convex condition applies.
 */
export const make: Effect.Effect<
  OpenAiClient.Service,
  AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayClient.make.pipe(
  Effect.provide(AiGatewayServiceToken.layer),
);

/**
 * Provide the AI gateway client using the current Effect HTTP client.
 */
export const layer: Layer.Layer<
  AiGatewayClient,
  AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayClient.layer.pipe(
  Layer.provide(AiGatewayServiceToken.layer),
);
