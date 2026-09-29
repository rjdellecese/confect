---
"@confect/js": minor
"@confect/foldkit": minor
---

Allow `setAuth` callbacks on `WebSocketClient` and Foldkit's `Client` to require Effect services. Provide those services when running `setAuth`; the token provider and authentication-state callback use them for later invocations, including token refreshes.

Keep scoped callback dependencies alive while authentication remains registered. Callbacks without dependencies continue to work unchanged.
