---
"@confect/core": major
"@confect/js": major
"@confect/server": major
---

Make Confect’s tagged error classes nominal in TypeScript. A separately declared error with the same tag and fields is no longer assignable to a Confect error such as `HttpClientError`, `WebSocketClientError`, or `GetByIdFailure`.

If you supplied a substitute, construct the exported error instead, for example with `HttpClientError.make({ cause })` from `@confect/js/HttpClient`. Existing instances, serialized error data, and matching on `_tag` are unchanged. Application-defined errors do not need a brand.
