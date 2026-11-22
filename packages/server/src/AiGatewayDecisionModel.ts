import type * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as OpenRouterDecisionModel from "@effect/ai-openrouter/OpenRouterDecisionModel";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as DecisionModel from "effect/ai/DecisionModel";
import type * as AiModel from "effect/ai/Model";

/**
 * Settings that select the gateway model for a decision service.
 *
 * @category Configuration
 */
export interface Options {
  /**
   * Gateway model identifier in `provider/model` format, such as
   * `"typesafe/jev-1.13"`.
   *
   * @category Configuration
   */
  readonly model: string;
}

/**
 * Creates an Effect AI model descriptor that provides `DecisionModel` through
 * the Convex AI gateway.
 *
 * **Details**
 *
 * Provide `AiGatewayDecisionClient.layer` for gateway access. The descriptor
 * selects a model by ID; it does not accept language-model request overrides.
 *
 * @category Constructors
 *
 * @param modelId - Gateway model identifier in `provider/model` format, such as
 *   `"typesafe/jev-1.13"`.
 *
 * @returns A model descriptor that also serves as a layer requiring the gateway
 *   decision client.
 *
 * @see {@link layer} to provide the decision service without a model descriptor.
 */
export const model = (
  modelId: string,
): AiModel.Model<
  "openrouter",
  DecisionModel.DecisionModel,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.model(modelId);

/**
 * Creates an Effect that builds a `DecisionModel` service using the gateway
 * decision client.
 *
 * @category Constructors
 *
 * @param options - Gateway model selection.
 *
 * @returns An Effect that produces the service without issuing a decision
 *   request. Individual decisions retain Effect AI's result and error types.
 *
 * @see {@link layer} to provide the service to other Effects.
 */
export const make = ({
  model: modelId,
}: Options): Effect.Effect<
  DecisionModel.DecisionModel,
  never,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.make({ model: modelId });

/**
 * Creates a layer that provides `DecisionModel` through the Convex AI gateway.
 *
 * @category Layers
 *
 * @param options - Gateway model selection.
 *
 * @returns A layer that requires the gateway decision client.
 *
 * @see {@link model} to retain the provider and model identifiers in a model descriptor.
 */
export const layer = ({
  model: modelId,
}: Options): Layer.Layer<
  DecisionModel.DecisionModel,
  never,
  OpenRouterClient.OpenRouterClient
> => OpenRouterDecisionModel.layer({ model: modelId });
