import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/http/HttpClient";
import * as InternalAiGatewayLanguageClient from "./internal/AiGatewayLanguageClient";
import * as AiGatewayServiceToken from "./internal/AiGatewayServiceToken";

/**
 * Public gateway availability failures and their schema/union.
 * AiGatewayDisabled means the plan or gateway setting disallows access;
 * AiGatewayUnavailable means this deployment cannot use the gateway. Neither
 * failure has extra payload fields. These aliases remain public although their
 * definitions live in an internal file.
 *
 * @category Errors
 */
export {
  AiGatewayDisabled,
  AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * The client service configured for Convex AI gateway language models.
 *
 * @category Services
 */
export const AiGatewayLanguageClient = OpenAiClient.OpenAiClient;
/**
 * Effect requirement of a language model using the gateway client layer.
 *
 * @category Services
 */
export type AiGatewayLanguageClient = OpenAiClient.OpenAiClient;

/**
 * Construct a language client using the current Effect HTTP client.
 *
 * @internal
 */
export const make: Effect.Effect<
  OpenAiClient.Service,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayLanguageClient.make.pipe(
  Effect.provideService(
    AiGatewayServiceToken.AiGatewayServiceToken,
    AiGatewayServiceToken.service,
  ),
);

/**
 * Provide the AI gateway language model client using the current Effect HTTP
 * client.
 *
 * Requires an Effect HttpClient (for example FetchHttpClient.layer) and a
 * running Convex action. Layer construction can fail with AiGatewayDisabled or
 * AiGatewayUnavailable. Credentials are obtained again for outgoing requests;
 * later failures surface through the model/HTTP client's error contract.
 *
 * This layer supplies the gateway language client and can be provided to
 * AiGatewayLanguageModel.model(...); it is a value, not a layer factory.
 *
 * @category Layers
 */
export const layer: Layer.Layer<
  AiGatewayLanguageClient,
  AiGatewayServiceToken.AiGatewayError,
  HttpClient.HttpClient
> = InternalAiGatewayLanguageClient.layer.pipe(
  Layer.provide(AiGatewayServiceToken.layer),
);
