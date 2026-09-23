import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { AiGatewayServiceToken } from "./AiGatewayServiceToken";

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken;
  const token = yield* serviceToken.get("ai-gateway");
  return yield* OpenRouterClient.make({
    apiUrl: "https://ai-gateway.convex.dev/v1",
    apiKey: Redacted.make(token),
  });
});

export const layer = Layer.effect(OpenRouterClient.OpenRouterClient, make);
