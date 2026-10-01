import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/http/HttpClient";
import * as InternalAiGatewayLanguageClient from "./internal/AiGatewayLanguageClient";
import * as AiGatewayServiceToken from "./internal/AiGatewayServiceToken";

export {
  AiGatewayDisabled,
  AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * The client service configured for Convex AI gateway language models.
 */
export const AiGatewayLanguageClient = OpenAiClient.OpenAiClient;
export type AiGatewayLanguageClient = OpenAiClient.OpenAiClient;

/**
 * Construct a language client using the current Effect HTTP client.
 */
export const make: Effect.Effect<
  OpenAiClient.Service,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayLanguageClient.make.pipe(
  Effect.provide(AiGatewayServiceToken.layer),
);

/**
 * Provide the AI gateway language model client using the current Effect HTTP
 * client.
 */
export const layer: Layer.Layer<
  AiGatewayLanguageClient,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayLanguageClient.layer.pipe(
  Layer.provide(AiGatewayServiceToken.layer),
);
