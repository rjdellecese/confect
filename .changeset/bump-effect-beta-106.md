---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.106` (from `^4.0.0-beta.105`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

`beta.106` is a patch-only Effect release. Nothing in Confect's own API changes, and your table, argument, and returns schemas still compile to the same Convex validators.

One Effect change needs a call-site edit if you derive property-test generators from those schemas: `Schema.toArbitrary` now returns a factory that takes the `fast-check` module instead of returning an arbitrary directly, and `Schema.toArbitraryLazy` and the `{ report: true }` option are gone.

**Before:**

```ts
const NoteArbitrary = Schema.toArbitrary(Note);
```

**After:**

```ts
import * as FastCheck from "fast-check";

const NoteArbitrary = Schema.toArbitrary(Note)(FastCheck);
```

HTTP actions written against `HttpRouter` also inherit Effect's stricter multipart handling: a request that exceeds the configured part count, part size, or field size limits now stops being parsed at the limit rather than being read to completion first.
