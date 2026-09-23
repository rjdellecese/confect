import type * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as OpenRouterDecisionModel from "@effect/ai-openrouter/OpenRouterDecisionModel";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as DecisionModel from "effect/unstable/ai/DecisionModel";
import type * as AiModel from "effect/unstable/ai/Model";

export interface Options {
  readonly model: string;
}

/**
 * Create an Effect AI decision model backed by the Convex AI gateway.
 *
 * Model identifiers use Convex's `provider/model` format, such as
 * `typesafe/jev-1.13`. Decisions use the gateway's alpha API.
 */
export const model = (
  modelId: string,
): AiModel.Model<
  "openrouter",
  DecisionModel.DecisionModel,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.model(modelId);

/**
 * Construct a decision-model service backed by the Convex AI gateway.
 */
export const make = ({
  model: modelId,
}: Options): Effect.Effect<
  DecisionModel.DecisionModel,
  never,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.make({ model: modelId });

/**
 * Provide a decision-model service backed by the Convex AI gateway.
 */
export const layer = ({
  model: modelId,
}: Options): Layer.Layer<
  DecisionModel.DecisionModel,
  never,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.layer({ model: modelId });
