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
    options: () =>
      Schema.Struct({
        admin: Schema.optionalKey(Schema.Boolean),
        editor: Schema.optionalKey(Schema.Boolean),
        viewer: Schema.optionalKey(Schema.Boolean),
      }),
    functionTypes: { query: true, mutation: true, action: true },
  },
) {}

FunctionSpec.publicQuery({
  name: "list",
  returns: () => Schema.Array(Schema.String),
}).middleware(RequireRole, { admin: true });
```

`MiddlewareImpl.make` and `MiddlewareImpl.makeByFunctionType` receive `(effect, { options, invocation })`, separating each attachment's typed options from invocation metadata. Middleware without an options schema keeps the single-argument attachment API and receives only `{ invocation }`, with no `options` property in its context type or runtime object. A declared schema that accepts `undefined` still receives the `options` property. Options schemas and values must be client-safe because generated refs carry them.

Repeat the same middleware with non-equivalent options within a group or function, or across both levels. Every attachment runs in order, with group middleware before function middleware, so repeated guards must all pass. `confect codegen` and server registration validate options on the schema's type side without decoding or coercion, and reject equivalent options for the same middleware key using `Schema.toEquivalence`. Use `Schema.overrideToEquivalence` to customize equality. Duplicate middleware without options remains a type error and an immediate runtime error; declared errors and service types remain unchanged.

Register each implementation using the same middleware spec that you attach. Server registration rejects implementations declared against a different spec, even when the keys match.

Codegen distinguishes invalid attachment configuration from unexpected exceptions in your schema factories or equality functions, which remain defects rather than being reported as invalid options.

Use `@confect/core/MiddlewareAttachment` for attachment types and `Result`-based collection validation with `validateAll`.

### Breaking Changes

- Middleware callbacks receive `name`, `functionType`, `functionVisibility`, and decoded `args` inside `invocation`, rather than directly on their second argument.
- `Ref.make` accepts group attachments as its third argument, rather than a specs-only list. Pass `[{ spec: MyMiddleware, options: undefined }]` for middleware without options, or provide the declared options value.

To migrate, nest metadata destructuring under `invocation` in callbacks passed to `MiddlewareImpl.make` or `MiddlewareImpl.makeByFunctionType`.

**Before:**

```ts
(effect, { name, args }) => effect;
```

**After:**

```ts
(effect, { invocation: { name, args } }) => effect;
```
