---
"@confect/cli": minor
"@confect/core": minor
"@confect/foldkit": minor
"@confect/js": minor
"@confect/react": minor
"@confect/server": minor
"@confect/test": minor
---

Require stable `effect@^4.0.0` and matching Effect platform and AI provider packages. `@confect/foldkit` now requires `foldkit@^0.165.0`, which supports Effect 4.0.0 without a peer-dependency override.

Upgrade Effect and its companion packages together. When upgrading Foldkit from 0.148, replace `m` declarations with `defineMessageUnion` from `foldkit/message`, replace `evo` with `modifyFields` from `foldkit/struct`, and return `{ model, commands }` from updates instead of `[model, commands]`. Confect's client and server call sites are unchanged.
