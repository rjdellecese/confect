import type * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai-compat/OpenAiLanguageModel";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as LanguageModel from "effect/ai/LanguageModel";
import type * as AiModel from "effect/ai/Model";

/**
 * Configuration overrides for Convex AI gateway language-model requests.
 *
 * @internal
 */
export const Config = OpenAiLanguageModel.Config;

/**
 * @internal
 */
export type Config = OpenAiLanguageModel.Config;

/**
 * @internal
 */
export interface Options {
  readonly model: string;
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">;
}

/**
 * Creates an Effect AI model descriptor that provides `LanguageModel` through
 * the Convex AI gateway.
 *
 * **Details**
 *
 * Provide `AiGatewayLanguageClient.layer` and an Effect HTTP client to run the
 * model. Request settings apply to both text generation and streaming; support
 * for individual settings depends on the selected model.
 *
 * @category Constructors
 *
 * @param modelId - Gateway model identifier in `provider/model` format, such as
 *   `"openai/gpt-4o-mini"`.
 * @param config - OpenAI-compatible request defaults, such as `temperature` or
 *   `max_output_tokens`.
 *
 * @returns A model descriptor that also serves as a layer requiring the gateway
 *   language client.
 *
 * @see {@link withConfigOverride} to change request settings for one Effect.
 */
export const model = (
  modelId: string,
  config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">,
): AiModel.Model<
  "openai",
  LanguageModel.LanguageModel,
  OpenAiClient.OpenAiClient
> => OpenAiLanguageModel.model(modelId, config);

/**
 * Construct a language-model service backed by the Convex AI gateway.
 *
 * @internal
 */
export const make = ({
  model: modelId,
  config,
}: Options): Effect.Effect<
  LanguageModel.LanguageModel,
  never,
  OpenAiClient.OpenAiClient
> => OpenAiLanguageModel.make({ model: modelId, config });

/**
 * Provide a language-model service backed by the Convex AI gateway.
 *
 * @internal
 */
export const layer = ({
  model: modelId,
  config,
}: Options): Layer.Layer<
  LanguageModel.LanguageModel,
  never,
  OpenAiClient.OpenAiClient
> => OpenAiLanguageModel.layer({ model: modelId, config });

/**
 * Applies OpenAI-compatible request settings to a single Effect. The supplied
 * fields override inherited settings for that Effect without changing the
 * model's defaults or capabilities.
 *
 * @category Configuration
 *
 * @returns An Effect with the same success and error types, or a function that
 *   transforms the Effect when given only the overrides.
 */
export const withConfigOverride = OpenAiLanguageModel.withConfigOverride;
