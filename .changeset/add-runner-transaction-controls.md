---
"@confect/server": major
"@confect/cli": minor
---

Add nested transaction controls to runner methods and replace callable runner services with objects exposing named methods.

### Breaking Changes

- `QueryRunner`, `MutationRunner`, and `ActionRunner` are no longer callable. Use their `runQuery`, `runMutation`, and `runAction` methods instead.

To migrate, destructure the named method from the service. Apply the same change to mutation and action runners; their availability in handlers is unchanged.

**Before:**

```ts
const firstNote = Effect.gen(function* () {
  const runQuery = yield* QueryRunner;
  return yield* runQuery(refs.public.notes.getFirst, {});
});
```

**After:**

```ts
const firstNote = Effect.gen(function* () {
  const { runQuery } = yield* QueryRunner;
  return yield* runQuery(refs.public.notes.getFirst, {});
});
```

Pass `{ transactionLimits: { documentsRead: 100 } }` as the third argument to `runQuery` in queries or mutations. For `runMutation`, pass `{ transactionLimits: { documentsWritten: 10 } }` inside mutations. `runQuery` also accepts `useStaleSnapshot` inside mutations; supplying it requires a mutation context even when its value is `false`. `runAction` has no options parameter, and action and HTTP handlers continue using runners without transaction options.

Regenerate `confect/_generated/services.ts` with `confect codegen` to include `QueryTransactionControls` and `MutationTransactionControls`. Confect supplies these call-time requirements automatically in supported handlers and middleware; keep calling runner methods rather than accessing the control services directly.
