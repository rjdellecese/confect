---
"@confect/cli": patch
---

Widen the accepted `esbuild` version range from `^0.27.3` to `0.27.0 - 0.27.3 || ^0.27.5 || ^0.28.0`.

The new range admits esbuild 0.27.0–0.27.2 (so package managers can dedupe against `convex`'s exact `0.27.0` pin) and the 0.28.x line, while explicitly excluding 0.27.4. That release has a metafile regression (fixed upstream in 0.27.5) that deadlocks esbuild's service on the first build error, hanging every subsequent bundle — which meant `confect dev` would stop rebuilding after a single failed build. Previously, the `^0.27.3` range allowed 0.27.4 to be installed.
