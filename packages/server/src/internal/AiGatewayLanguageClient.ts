import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { withServiceToken } from "./AiGatewayHttpClient";
import * as AiGatewayServiceToken from "./AiGatewayServiceToken";

const API_URL = "https://ai-gateway.convex.dev/v1";

export const make = Effect.gen(function* () {
  const serviceToken = yield* AiGatewayServiceToken.AiGatewayServiceToken;
  yield* serviceToken.get("ai-gateway");
  return yield* OpenAiClient.make({
    apiUrl: API_URL,
    transformClient: withServiceToken(serviceToken),
  });
});

export const layer = Layer.effect(OpenAiClient.OpenAiClient, make);
