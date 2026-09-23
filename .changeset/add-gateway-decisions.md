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
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

const Jev = AiGatewayDecisionModel.model("typesafe/jev-1.13").pipe(
  Layer.provide(AiGatewayDecisionClient.layer),
  Layer.provide(FetchHttpClient.layer),
);
```

Provide `Jev` to `DecisionModel.decide` inside a Convex action to evaluate named decisions in one request.

Classification and rating currently require full probability distributions summing to one within `1e-6`. Jev's two-decimal rounding can cause otherwise valid answers to fail with `AiError.InvalidOutputError`; Confect does not renormalize those probabilities.
