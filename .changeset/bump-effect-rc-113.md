---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/foldkit": patch
"@confect/cli": patch
"@confect/test": patch
---

Require `effect@^4.0.0-rc.113` across `@confect/*` and raise `@confect/server`'s optional `@effect/platform-node` peer to the same range. Upgrade Effect alongside Confect; existing Confect call sites are unchanged.

Effect's own APIs include breaking renames: use `Config.String` instead of `Config.string`, and `LanguageModel.LanguageModel` instead of `LanguageModel.Service` when annotating the result of `AiGatewayLanguageModel.make`. See the [Effect RC 113 release notes](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.113) for the complete migration guidance.
