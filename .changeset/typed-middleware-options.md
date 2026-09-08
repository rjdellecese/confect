---
"@confect/core": minor
"@confect/server": minor
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

`MiddlewareImpl.make` and `MiddlewareImpl.makeByFunctionType` receive each attachment's value in the invocation metadata's `options` field. Middleware without options keeps the single-argument attachment API. Options schemas and values must be client-safe because generated refs carry them.

Repeat the same middleware with non-equivalent options within a group or function, or across both levels. Every attachment runs in order, with group middleware before function middleware, so repeated guards must all pass. `confect codegen` and server registration validate options on the schema's type side without decoding or coercion, and reject equivalent options for the same middleware key using `Schema.toEquivalence`. Use `Schema.overrideToEquivalence` to customize equality. Duplicate middleware without options remains a type error and an immediate runtime error; declared errors and service types remain unchanged.
