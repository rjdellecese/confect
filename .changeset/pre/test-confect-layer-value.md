---
"@confect/test": major
---

`TestConfect.layer` now returns a `Layer` directly rather than a function returning one. Drop the trailing call.

Before:

```ts
export const layer = TestConfect_.layer(
  confectSchema,
  convexSchema,
  import.meta.glob("./convex/**/!(*.*.*)*.*s"),
);

// …then, per test:
Effect.gen(function* () {
  // …
}).pipe(Effect.provide(TestConfect.layer()));
```

After:

```ts
export const layer = TestConfect_.layer(
  confectSchema,
  convexSchema,
  import.meta.glob("./convex/**/!(*.*.*)*.*s"),
);

// …then, per test:
Effect.gen(function* () {
  // …
}).pipe(Effect.provide(TestConfect.layer));
```

Each test still gets its own database. The layer is built once per `Effect.provide`, so providing the same value to several tests constructs a fresh test instance for each — the same isolation the extra call used to provide.
