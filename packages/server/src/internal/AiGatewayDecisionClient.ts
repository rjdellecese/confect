import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as AiGatewayServiceToken from "./AiGatewayServiceToken";

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken.AiGatewayServiceToken;
  yield* serviceToken.get("ai-gateway");
  return yield* OpenRouterClient.make({
    apiUrl: "https://ai-gateway.convex.dev/v1",
    transformClient: AiGatewayServiceToken.transformRequest(serviceToken),
  });
});

export const layer = Layer.effect(OpenRouterClient.OpenRouterClient, make);
