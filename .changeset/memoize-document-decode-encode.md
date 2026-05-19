---
"@confect/server": patch
---

Memoize `Document.decode` and `Document.encode` parsers in module-scoped `WeakMap` caches. Decoders are keyed by table schema and table name so shared schemas across tables get the correct `extendWithSystemFields` parser; encoders are keyed by schema only.
