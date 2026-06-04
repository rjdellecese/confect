---
"@confect/server": minor
"@confect/cli": minor
---

Add an opt-in `--skip-validators` codegen flag that registers Convex functions without compiled args/returns validators, trimming per-function cold-start time.

By default every confect query/mutation/action compiles its `args` and `returns` `Schema` into Convex validators at registration — work that runs when the function's module is evaluated on every cold start. Because confect already runs `Schema.decode(args)` and `Schema.encode(returns)` inside each handler, those Convex validators are redundant for confect's own correctness.

Passing `--skip-validators` to `confect codegen` / `confect dev` (or setting `CONFECT_SKIP_VALIDATORS=true`) makes codegen emit registries that route through new validator-free builders, so the args/returns validator compilation (`compileArgsSchema` / `compileReturnsSchema`) is tree-shaken out and never runs at registration. Convex then accepts any args and confect's handler-level decode/encode continues to enforce correctness.

Trade-off: with validators skipped, Convex no longer validates args at the boundary before the handler (a failed `Schema.decode` dies the request instead), and the function's args/returns no longer appear in Convex's deployed function spec / `api.d.ts`. Confect's own clients are unaffected (they derive types from the Effect schemas). The flag defaults to off, so existing projects are unchanged until they opt in.

This does not affect table validators or the deploy schema (`convex/schema.ts`), which still validate stored documents.

New exports: `RegisteredConvexFunctionWithoutValidators` (`@confect/server`) and `RegisteredNodeFunctionWithoutValidators` (`@confect/server/node`).
