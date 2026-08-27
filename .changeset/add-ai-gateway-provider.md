---
"@confect/server": minor
---

Add `AiGatewayClient` and `AiGatewayLanguageModel`, an Effect AI `LanguageModel` provider for calling models through the Convex AI gateway from actions without configuring provider API keys.

```ts
import { AiGatewayClient, AiGatewayLanguageModel } from "@confect/server";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

const Claude = AiGatewayLanguageModel.model("anthropic/claude-sonnet-4.5").pipe(
  Layer.provide(AiGatewayClient.layer),
  Layer.provide(FetchHttpClient.layer),
);
```

`@confect/server` now requires `convex ^1.45.0` for AI gateway service-token support.
Service-token acquisition exposes Convex's documented `AiGatewayDisabled` and `AiGatewayUnavailable` conditions as tagged Effect errors; unexpected failures remain defects.
