# confect-oxlint-rules

An internal (unpublished) oxlint JS plugin carrying the repo-specific lint
rules that oxlint's built-in plugins can't express. Rules are authored with
[`effect-oxlint`](https://github.com/mpsuesser/effect-oxlint), which wraps
oxlint's JS plugin API (`@oxlint/plugins`) in Effect idioms.

The root `.oxlintrc.json` loads the plugin via its `jsPlugins` field, using
this package's name as the specifier (the root `package.json` depends on it
so the specifier resolves). Rules are namespaced under `confect/` and must be
enabled explicitly in the config — loading the plugin alone enables nothing.

oxlint resolves the specifier with Node's module loader, so the package
exports its TypeScript source directly and relies on Node's built-in type
stripping (Node ≥ 22.18) — there is no build step, and lint works from a
fresh clone without one. Type stripping is also why everything lives in
`src/index.ts`: stripped modules need explicit `.ts` extensions on relative
imports, which the workspace tsconfig doesn't permit.

## Rules

- `confect/prefer-effect-vitest` — test files must import from
  `@effect/vitest` rather than `vitest`. `@effect/vitest` re-exports
  everything `vitest` does alongside the Effect-aware test APIs, so the rule
  ships an autofix that rewrites the module specifier.

## Testing

Rule tests live in `test/` and run as the `confect-oxlint-rules` Vitest
project, using `effect-oxlint/testing`'s mock AST builders and rule runners:

```sh
vitest run --project confect-oxlint-rules
```
