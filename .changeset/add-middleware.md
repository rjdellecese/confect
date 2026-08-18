---
"@confect/core": minor
"@confect/server": minor
"@confect/cli": minor
---

Add middleware: reusable logic that runs around a group's function handlers, provides Effect services to them, and fails with typed errors that reach clients.

Middleware lives in a reserved `confect/middleware/` directory, one `<Name>.spec.ts`/`<Name>.impl.ts` pair per middleware. Confect no longer scans that directory for function groups, so a group can no longer be defined at `confect/middleware/...`.

Declare a middleware's client-safe interface with `MiddlewareSpec.Service` — its `provides` service (type-level), its `error` schema, and the function types it may cover (`functionTypes`, one boolean flag per function type, each defaulting to `true`; `{ action: false }` declares queries and mutations) — and attach it in a group spec with `GroupSpec.middleware`:

```ts confect/middleware/RequireUser.spec.ts
import { MiddlewareSpec } from "@confect/core";

export class CurrentUser extends Context.Service<
  CurrentUser,
  {
    readonly user: User;
  }
>()("confect/middleware/RequireUser.spec/CurrentUser") {}

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  "NotSignedIn",
  {},
) {}

export default class RequireUser extends MiddlewareSpec.Service<
  RequireUser,
  {
    provides: CurrentUser;
  }
>()("RequireUser", { error: () => NotSignedIn }) {}
```

```ts confect/notes.spec.ts
import RequireUser from "./middleware/RequireUser.spec";

export default GroupSpec.make()
  .middleware(RequireUser)
  .addFunction(FunctionSpec.publicMutation({ ... }));
```

Handlers of covered functions can then consume the provided service — a handler requiring `CurrentUser` type-checks exactly when a middleware providing it is attached to the group. Implement the middleware server-side with `MiddlewareImpl.make` (one strategy for all declared function types), `MiddlewareImpl.makeByFunctionType` (one per function type — the recommended shape for database-touching middleware that also covers actions), or the `MiddlewareImpl.provides` shorthand, and provide it to the group's impl layer like any function implementation:

```ts confect/middleware/RequireUser.impl.ts
import { MiddlewareImpl } from "@confect/server";

export default MiddlewareImpl.provides(
  databaseSchema,
  RequireUser,
  CurrentUser,
  Effect.gen(function* () {
    // load the user; `return yield* new NotSignedIn()` short-circuits
    return { user };
  }),
);
```

```ts confect/notes.impl.ts
import RequireUser from "./middleware/RequireUser.impl";

export default GroupImpl.make(databaseSchema, group).pipe(
  Layer.provide(createNote),
  Layer.provide(RequireUser), // omitting this is a compile error at `GroupImpl.finalize`
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

Because every `*.spec.ts` is reachable from `_generated/refs.ts`, which clients import, a spec's whole import graph is bundled into the browser — so an implementation co-located with its declaration ships server logic (table names, index names, authorization checks) to users. `confect codegen` now fails when any module a spec reaches value-imports `@confect/server`, outside the `tables/` and `_generated/` directories that legitimately need it. Type-only imports are erased before bundling and remain allowed.
