---
"@confect/core": minor
"@confect/server": minor
"@confect/cli": minor
---

Add middleware: reusable logic that runs around a group's function handlers, provides Effect services to them, and fails with typed errors that reach clients.

Declare a middleware's client-safe interface with `MiddlewareSpec.Service` — its `provides` service (type-level), its `error` schema, and the function `functionTypes` it may cover — and attach it in the spec with `GroupSpec.middleware`:

```ts
import { MiddlewareSpec } from "@confect/core";

export class CurrentUser extends Context.Service<CurrentUser, {
  readonly user: User;
}>()("confect/CurrentUser") {}

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()("NotSignedIn", {}) {}

export class RequireUser extends MiddlewareSpec.Service<RequireUser, {
  provides: CurrentUser;
}>()("RequireUser", { error: () => NotSignedIn }) {}

export default GroupSpec.make()
  .middleware(RequireUser)
  .addFunction(FunctionSpec.publicMutation({ ... }));
```

Handlers of covered functions can then consume the provided service — a handler requiring `CurrentUser` type-checks exactly when a middleware providing it is attached to the group. Implement the middleware server-side with `MiddlewareImpl.make` (one strategy for all declared function types), `MiddlewareImpl.makeByFunctionType` (one per function type — the recommended shape for database-touching middleware that also covers actions), or the `MiddlewareImpl.provides` shorthand, and provide it to the group's impl layer like any function implementation:

```ts
import { MiddlewareImpl } from "@confect/server";

const RequireUserLive = MiddlewareImpl.provides(
  databaseSchema,
  RequireUser,
  CurrentUser,
  Effect.gen(function* () {
    // load the user; `return yield* Effect.fail(new NotSignedIn())` short-circuits
    return { user };
  }),
);

export default GroupImpl.make(databaseSchema, group).pipe(
  Layer.provide(createNote),
  Layer.provide(RequireUserLive), // omitting this is a compile error at `GroupImpl.finalize`
  GroupImpl.finalize,
);
```

Middleware runs per invocation, after args are decoded and before the handler, in attachment order; a middleware failure short-circuits the rest of the chain. Its errors join the covered functions' error unions end to end: `useQuery`/`useMutation` and the `@confect/js` clients surface them as typed errors with no client-side changes.

Middleware can also attach to a single function with `.middleware()` on the function spec — it runs inside the group-attached chain, immediately around the handler, and its errors join only that function's error union:

```ts
FunctionSpec.publicMutation({ name: "deleteAll", ... }).middleware(RequireAdmin);
```

A middleware can depend on one that runs earlier in the chain by declaring `requires` in its `Config` type parameter — its implementation may then consume the required service (e.g. `RequireAdmin` reading the `CurrentUser` that `RequireUser` provides). Satisfaction is type-checked at `GroupSpec.middleware` for group attachments and at `GroupImpl.make` for whole groups.

Attaching the same middleware twice (including once at group level and once at function level), attaching one whose `functionTypes` don't cover a covered function's type, attaching any middleware to a plain-Convex function, or attaching to a group containing a matching-type plain-Convex function are all type errors. Middleware does not propagate to subgroups. `confect codegen` fails with an explicit error when a group's spec attaches a middleware its impl never provides.
