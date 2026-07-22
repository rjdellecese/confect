---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.100` (from `^4.0.0-beta.99`).

This is a peer-range-only change with no consumer-visible API consequences. The `beta.100` release only touches `Cron` internals (month/weekday alias normalization, day/weekday rollover, and equality/hashing), CLI error message formatting (`InvalidValue` prefixes), and `Schema.toTaggedUnion` discriminants that Confect doesn't use.
