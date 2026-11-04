import { dual } from "effect/Function";
import type * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai-compat/OpenAiLanguageModel";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as LanguageModel from "effect/ai/LanguageModel";
import type * as AiModel from "effect/ai/Model";

/**
 * Configuration overrides for Convex AI gateway language-model requests.
 *
 * @stability unstable
 */
export const Config = OpenAiLanguageModel.Config;

export type Config = OpenAiLanguageModel.Config;

/**
 * @stability unstable
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
 * @stability unstable
 */
export const model = dual<
  (
    config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">,
  ) => (
    modelId: string,
  ) => AiModel.Model<
    "openai",
    LanguageModel.LanguageModel,
    OpenAiClient.OpenAiClient
  >,
  (
    modelId: string,
    config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">,
  ) => AiModel.Model<
    "openai",
    LanguageModel.LanguageModel,
    OpenAiClient.OpenAiClient
  >
>(
  (args) => typeof args[0] === "string",
  (
    modelId: string,
    config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">,
  ): AiModel.Model<
    "openai",
    LanguageModel.LanguageModel,
    OpenAiClient.OpenAiClient
  > => OpenAiLanguageModel.model(modelId, config),
);

/**
 * Construct a language-model service backed by the Convex AI gateway.
 *
 * @stability unstable
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
 * @stability unstable
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
 *
 * @stability unstable
 */
export const withConfigOverride = OpenAiLanguageModel.withConfigOverride;
