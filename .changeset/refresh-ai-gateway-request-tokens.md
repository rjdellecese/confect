---
"@confect/server": patch
---

Obtain the current Convex service token before each request made by `AiGatewayLanguageClient` or `AiGatewayDecisionClient`, so clients reused within a long-running action can use refreshed credentials.

Construction still reports disabled or unavailable gateways through the existing typed errors. Token acquisition failures on later requests use the client's HTTP/AI error channel, and the request is not sent.
