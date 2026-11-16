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
 * Create an Effect AI model backed by the Convex AI gateway.
 *
 * Model identifiers use Convex's `provider/model` format.
 *
 * @param modelId - Gateway model identifier, for example "openai/gpt-4o-mini".
 * @param config - Upstream OpenAI-compatible request settings, such as
 *   temperature or max_output_tokens; support depends on the selected model.
 *
 * @returns An Effect AI model descriptor/layer. Provide
 *   AiGatewayLanguageClient.layer and an Effect HTTP client to run its
 *   operations.
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
 * Apply request configuration to an Effect AI operation within a local scope.
 * Pass upstream OpenAI-compatible overrides to this combinator and apply it to
 * the operation Effect. It retains the operation's success/error channels and
 * does not change the gateway model's supported capabilities.
 */
export const withConfigOverride = OpenAiLanguageModel.withConfigOverride;
