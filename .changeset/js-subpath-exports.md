---
"@confect/js": minor
---

Add per-module subpath exports to `@confect/js`, so `import * as WebSocketClient from "@confect/js/WebSocketClient"` and `import * as HttpClient from "@confect/js/HttpClient"` now resolve. The root import (`import { HttpClient, WebSocketClient } from "@confect/js"`) is unchanged.
