---
"@confect/server": patch
---

Improve `Document.decode` performance by memoizing `Schema.decodeUnknownSync` decoders in a `WeakMap` keyed by table schema identity, avoiding repeated decoder compilation on every document decode.
