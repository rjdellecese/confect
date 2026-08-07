---
"@confect/cli": minor
---

Support Windows. `confect codegen` and `confect dev` now run natively on Windows, alongside Linux and macOS.

Previously, generated files under `confect/_generated/` and `convex/` were written with Windows path separators in their `import` statements (`import databaseSchema from "..\_generated\schema";`). Because `\_` and `\s` are identity escapes, that specifier silently reads as `.._generatedschema` rather than failing to parse — so every generated file broke with an unresolved-module error pointing at a path that appears nowhere in the source. Generated import specifiers are now always `/`-separated regardless of the platform that ran codegen, so the same generated files are produced — and stay byte-identical — on every OS.

Convex's own [local deployments](https://docs.convex.dev/cli/local-deployments) (anonymous development and self-hosting) still require WSL or Docker on Windows, because Convex publishes no Windows build of `convex-local-backend`. Developing against a Convex cloud deployment is unaffected.
