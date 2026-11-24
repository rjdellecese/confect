---
"@confect/js": major
---

Make `WebSocketClientError` nominal in TypeScript. A separately declared error with the same tag and fields is no longer assignable to it. If you supplied a substitute, use `WebSocketClientError.make({ cause })` from `@confect/js/WebSocketClient` instead. Existing instances and the serialized error format are unchanged.
