---
"@confect/core": minor
"@confect/server": minor
---

Reuse middleware policies with typed attachment options. Declare an `options` type alongside `provides` and `requires`, then pass its value when attaching the middleware to a function or group:

```ts
FunctionSpec.publicQuery({
  name: "list",
  returns: () => Schema.Array(Schema.String),
}).middleware(RequireRole, { roles: ["Internal"] });
```

`MiddlewareImpl.make` and `MiddlewareImpl.makeByFunctionType` receive the value in the invocation metadata's `options` field. Middleware without options keeps the existing single-argument attachment API. Options are carried by generated refs, so their values must be client-safe; error unions and execution order are unchanged. Attaching the same middleware key more than once remains an error, even with different options.
