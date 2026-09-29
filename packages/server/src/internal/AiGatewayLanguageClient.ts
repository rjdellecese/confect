import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { AiGatewayServiceToken } from "./AiGatewayServiceToken";

const API_URL = "https://ai-gateway.convex.dev/v1";

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken;
  const token = yield* serviceToken.get("ai-gateway");
  return yield* OpenAiClient.make({
    apiUrl: API_URL,
    apiKey: Redacted.make(token),
  });
});

export const layer = Layer.effect(OpenAiClient.OpenAiClient, make);
