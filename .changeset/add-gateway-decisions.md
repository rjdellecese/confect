---
"@confect/server": minor
---

Add `AiGatewayDecisionClient` and `AiGatewayDecisionModel` to classify input, rate it against a rubric, and estimate probabilities with Effect AI through Convex's alpha Decisions API, without configuring a provider API key.

```ts
import {
  AiGatewayDecisionClient,
  AiGatewayDecisionModel,
} from "@confect/server";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

const Jev = AiGatewayDecisionModel.model("typesafe/jev-1.13").pipe(
  Layer.provide(AiGatewayDecisionClient.layer),
  Layer.provide(FetchHttpClient.layer),
);
```

Provide `Jev` to `DecisionModel.decide` inside a Convex action to evaluate named decisions in one request.

Classification and rating return full probability distributions normalized to sum to one when Jev's two-decimal rounding introduces small discrepancies. Missing or invalid probabilities still fail with `AiError.InvalidOutputError`.
