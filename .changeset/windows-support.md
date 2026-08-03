---
"@confect/cli": minor
---

Support Windows. `confect codegen` and `confect dev` now run natively on Windows, alongside Linux and macOS.

Previously, generated files under `confect/_generated/` and `convex/` were written with Windows path separators in their `import` statements (`import databaseSchema from "..\_generated\schema";`), which is neither a resolvable module specifier nor a valid string literal, so nothing the CLI generated would compile. Generated import specifiers are now always `/`-separated regardless of the platform that ran codegen, so the same generated files are produced — and stay byte-identical — on every OS.

Convex's own [local deployments](https://docs.convex.dev/cli/local-deployments) (anonymous development and self-hosting) still require WSL or Docker on Windows, because Convex publishes no Windows build of `convex-local-backend`. Developing against a Convex cloud deployment is unaffected.
