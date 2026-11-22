import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/http/HttpClient";
import * as InternalAiGatewayLanguageClient from "./internal/AiGatewayLanguageClient";
import * as AiGatewayServiceToken from "./internal/AiGatewayServiceToken";

/**
 * Tagged errors for a disabled gateway or an unsupported deployment, and the
 * schema that accepts either error. Both gateway clients expose the same
 * errors; neither error carries additional payload fields.
 *
 * @category Errors
 */
export {
  AiGatewayDisabled,
  AiGatewayError,
  AiGatewayUnavailable,
} from "./internal/AiGatewayServiceToken";

/**
 * Service tag for the OpenAI-compatible client used by gateway language models.
 * Provide {@link layer} to authenticate requests with the current Convex
 * deployment.
 *
 * @category Tags
 */
export const AiGatewayLanguageClient = OpenAiClient.OpenAiClient;
/**
 * Client requirement of a gateway language model, satisfied by {@link layer}.
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
 * Layer that provides the OpenAI-compatible client for `AiGatewayLanguageModel`
 * using an Effect `HttpClient` in a running Convex action.
 *
 * **Details**
 *
 * The layer checks gateway access when built and obtains a bearer token for
 * each outgoing request. Provide an HTTP client such as `FetchHttpClient.layer`
 * for transport.
 *
 * **Gotchas**
 *
 * Building the layer can fail with `AiGatewayDisabled` or
 * `AiGatewayUnavailable`. If token acquisition fails with either error later,
 * the request is not sent: the HTTP client reports a transport error, and model
 * operations report an AI network error.
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
