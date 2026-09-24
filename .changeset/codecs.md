---
"@confect/core": patch
"@confect/server": patch
---

Match object schemas exactly when encoding and decoding document fields, function arguments, and function results. This prevents overlapping union members from silently discarding data. Continue removing Convex system fields before document encoding and client-owned pagination options before encoding paginated user arguments. Typed error codecs retain their existing handling of Error properties.
