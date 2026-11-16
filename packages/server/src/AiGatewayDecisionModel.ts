import type * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as OpenRouterDecisionModel from "@effect/ai-openrouter/OpenRouterDecisionModel";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as DecisionModel from "effect/ai/DecisionModel";
import type * as AiModel from "effect/ai/Model";

/**
 * Settings for constructing a gateway-backed decision service.
 */
export interface Options {
  /**
   * Gateway provider/model identifier, for example "typesafe/jev-1.13".
   */
  readonly model: string;
}

/**
 * Create an Effect AI decision model backed by the Convex AI gateway.
 *
 * Model identifiers use Convex's `provider/model` format, such as
 * `typesafe/jev-1.13`.
 *
 * @param modelId - Gateway provider/model identifier.
 *
 * @returns An Effect AI model descriptor/layer requiring
 *   AiGatewayDecisionClient. Decision requests do not expose language-model
 *   configuration overrides.
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
 *
 * @param options - Gateway model selection.
 *
 * @returns An Effect producing a DecisionModel service and requiring the
 *   gateway decision client. Model operations retain Effect AI's typed
 *   result/error contracts.
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
 *
 * @param options - Gateway model selection.
 *
 * @returns A layer supplying DecisionModel and requiring the gateway decision
 *   client.
 */
export const layer = ({
  model: modelId,
}: Options): Layer.Layer<
  DecisionModel.DecisionModel,
  never,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.layer({ model: modelId });
