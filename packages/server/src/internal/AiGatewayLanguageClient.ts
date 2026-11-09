import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import { getServiceUrl } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as AiGatewayServiceToken from "./AiGatewayServiceToken";

/**
 * @internal
 */
export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken.AiGatewayServiceToken;
  yield* serviceToken.get("ai-gateway");
  const origin = yield* Effect.promise(() => getServiceUrl("ai-gateway"));
  return yield* OpenAiClient.make({
    apiUrl: `${origin}/v1`,
    transformClient: AiGatewayServiceToken.transformClientRequest(serviceToken),
  });
});

/**
 * @internal
 */
export const layer = Layer.effect(OpenAiClient.OpenAiClient, make);
