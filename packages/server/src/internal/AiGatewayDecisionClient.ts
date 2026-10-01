import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as AiGatewayServiceToken from "./AiGatewayServiceToken";
import { AI_GATEWAY_API_URL } from "./constants";

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken.AiGatewayServiceToken;
  yield* serviceToken.get("ai-gateway");
  return yield* OpenRouterClient.make({
    apiUrl: AI_GATEWAY_API_URL,
    transformClient: AiGatewayServiceToken.transformClientRequest(serviceToken),
  });
});

export const layer = Layer.effect(OpenRouterClient.OpenRouterClient, make);
