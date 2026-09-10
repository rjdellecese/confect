---
"@confect/core": major
"@confect/server": major
"@confect/cli": minor
---

Add schema-backed middleware options and repeatable policy attachments. Declare a lazy `options` schema, then pass a value of its inferred `Type` when attaching the middleware to a function or group:

```ts
import { FunctionSpec, MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";

class RequireRole extends MiddlewareSpec.MiddlewareSpec<RequireRole>()(
  "RequireRole",
  {
    options: () => Schema.Struct({ roles: Schema.Array(Schema.String) }),
    functionTypes: { query: true, mutation: true, action: true },
  },
) {}

FunctionSpec.publicQuery({
  name: "list",
  returns: () => Schema.Array(Schema.String),
}).middleware(RequireRole, { roles: ["Internal"] });
```

`MiddlewareImpl.make` and `MiddlewareImpl.makeByFunctionType` receive `(effect, { options, invocation })`, separating each attachment's typed options from invocation metadata. Middleware without options keeps the single-argument attachment API and receives `options: undefined`; its implementation can use `(effect, { invocation })` to access metadata. Options schemas and values must be client-safe because generated refs carry them.

Repeat the same middleware with non-equivalent options within a group or function, or across both levels. Every attachment runs in order, with group middleware before function middleware, so repeated guards must all pass. `confect codegen` and server registration validate options on the schema's type side without decoding or coercion, and reject equivalent options for the same middleware key using `Schema.toEquivalence`. Use `Schema.overrideToEquivalence` to customize equality. Duplicate middleware without options remains a type error and an immediate runtime error; declared errors and service types remain unchanged.

### Breaking Changes

- Middleware callbacks receive `name`, `functionType`, `functionVisibility`, and decoded `args` inside `invocation`, rather than directly on their second argument.

To migrate, nest metadata destructuring under `invocation` in callbacks passed to `MiddlewareImpl.make` or `MiddlewareImpl.makeByFunctionType`.

**Before:**

```ts
(effect, { name, args }) => effect;
```

**After:**

```ts
(effect, { invocation: { name, args } }) => effect;
```
