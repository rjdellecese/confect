# Middleware for Confect: design proposals

**Status:** Draft for discussion
**Relates to:** [#395 — RFC: Pipeable middleware for Confect function implementations](https://github.com/rjdellecese/confect/issues/395)

This document surveys how middleware could work in Confect. It starts from the
constraints Confect's existing architecture imposes, reviews how Effect's own
libraries (`HttpApi`, `Rpc`) solve the same problem, analyzes the shape proposed
in #395, and then makes three concrete proposals with a recommendation.

---

## 1. What middleware needs to do

Distilled from #395 and from what `convex-helpers`' `customFunction`s are used
for in practice:

- Run per invocation, after args are decoded and before the handler.
- Provide Effect services to downstream middleware and handlers (the flagship
  use case: `CurrentUser`).
- Be able to inspect decoded args, fail, and short-circuit — through Confect's
  normal typed error path, all the way to typed errors on the client.
- Compose in order; attach at the group level and at the function level.
- Participate in the Effect environment type: a handler that requires
  `CurrentUser` must only type-check when some middleware on that function (or
  its group) provides it.
- Respect function kinds: queries read, mutations read/write, actions have no
  direct database access.

## 2. Constraints from Confect's architecture

These are the load-bearing facts about the current codebase that any design has
to answer to.

**(a) Specs are shared with clients; the client's error type comes from the
spec.** `Ref.Error<Ref_>` is derived from `FunctionSpec.Error`
(`packages/core/src/Ref.ts`), and both clients (`@confect/js`,
`@confect/react`) decode a thrown `ConvexError` against the spec's `error`
schema (`Ref.decodeErrorOption`). **If a middleware can fail with a typed
error that reaches the client, that error type must be visible in the spec.**
An implementation-only middleware concept — which is what #395 proposes ("this
belongs in the implementation layer rather than the spec") — cannot give
clients typed middleware errors, because the client never sees impl code. This
is the single most consequential fact for the design.

**(b) Handler environments are closed unions, and that's the enforcement
mechanism.** `Handler.WithName` types each handler as
`(args) => Effect<Returns, Error, R>` where `R` is the exact ctx-service union
for the function's kind (`packages/server/src/Handler.ts`). A handler that
requires anything extra — say `CurrentUser` — already fails to type-check
today. Middleware support means _widening `R` with exactly the services
provided by the middleware attached to that function_, and nothing else. To
compute that union at the `FunctionImpl.make` call site, the middleware
attachments must be knowable from the types passed to it — i.e. from the
`GroupSpec`/`FunctionSpec` types, not from `pipe` calls that happen later.

**(c) Impl completeness is enforced through Layer requirements.**
`GroupImpl.make` returns a `Layer` requiring one `FunctionImpl<Name>` service
per declared function; `GroupImpl.finalize` demands `RIn = never`
(`packages/server/src/GroupImpl.ts`). This is a proven pattern in the codebase
and extends naturally: _middleware implementations can be one more required
service per attached middleware_, so forgetting to provide one is a compile
error at the same place forgetting a function impl is.

**(d) Ctx services are built fresh per invocation.** `DatabaseReader`, `Auth`,
etc. are provided from the Convex `ctx` inside each registered function's
handler (`packages/server/src/RegisteredConvexFunction.ts`). So a middleware's
_implementation_ must be a value constructed once at group-build time whose
_execution_ happens per invocation with per-invocation services in scope — an
`Effect` stored in the registry, not a `Layer` memoized across calls.

**(e) Function kinds differ in services — but `QueryRunner` is everywhere.**
The query/mutation/action ctx unions differ, but all three include
`QueryRunner` (and mutation/action include `MutationRunner`). A middleware
that loads the current user via an internal query (`runQuery`) works
identically in all three kinds. This substantially defuses #395's "maybe
middleware needs `{query, mutation, action}` triples" concern: kind-generic
middleware is expressible today with one implementation, and per-kind
implementations can be an additive convenience rather than the core mechanism.

**(f) The codegen boundary.** `_generated/registeredFunctions/*` calls
`RegisteredFunctions.buildForGroup(databaseSchema, implLayer, RegisteredConvexFunction.make)`,
which builds the group layer against a fresh `Registry` and turns registry
items into registered Convex functions. Whatever middleware machinery exists
must flow through this boundary: registered by impl layers into the
`Registry`, then composed around handlers in
`RegisteredConvexFunction.make`.

## 3. Prior art

### 3.1 Effect `HttpApiMiddleware` / `RpcMiddleware` (v3 → v4)

Both libraries converged on one architecture, which maps remarkably well onto
Confect's spec/impl model. (Verified against `effect@4.0.0-beta.106` source —
`unstable/httpapi/HttpApiMiddleware.ts`, `unstable/rpc/RpcMiddleware.ts` — and
against the v3 packages Confect currently depends on.)

- **A middleware is a service class declared in shared (spec-level) code.** In
  v4: `class Auth extends RpcMiddleware.Service<Auth, { provides: CurrentUser,
requires: ... }>()("Auth", { error: Unauthorized })`. `provides` and
  `requires` are _purely type-level_ (they live in the `Config` type
  parameter); `error` is a runtime schema stored on the class. The class
  contains no server logic and is safe to share with clients. (In v3 this was
  `HttpApiMiddleware.Tag`/`RpcMiddleware.Tag`, with `provides` as a _runtime_
  `Context.Tag` value and the error option named `failure`.)
- **The service value bound to the class _is the middleware function_, and in
  v4 it is wrap-style only.** The v3 design had an effect-style "provides"
  middleware (run before the handler, produce the service, `optional` flag to
  swallow failures) with wrap as an opt-in (`wrap: true`, Rpc only). v4
  removed both `wrap` and `optional`: every middleware receives the downstream
  effect as its first argument —

  ```ts
  interface RpcMiddleware<Provides, E, Requires> {
    (effect: Effect<SuccessValue, E | unhandled, Provides>,
     options: { rpc, payload, headers, ... }):
      Effect<SuccessValue, E | unhandled, Requires | Scope>
  }
  ```

  `SuccessValue` is an opaque brand (middleware cannot inspect or corrupt the
  return value) and `unhandled` is a branded error type (middleware cannot
  absorb handler errors it doesn't know about). "Provides" is not runtime
  machinery: the incoming effect carries `Provides` in its `R`, and the
  middleware discharges the obligation itself via
  `Effect.provideService(effect, CurrentUser, user)`. Short-circuiting is
  simply not running `effect` and returning `Effect.fail(new Unauthorized())`.

- **Attachment happens at the spec level** — `HttpApiEndpoint.middleware(M)`,
  `HttpApiGroup.middleware(M)`, `RpcGroup.middleware(M)` — recorded as a
  `ReadonlySet` of middleware keys on the endpoint/rpc. Group/api-level
  attachment is fan-out: it maps per-endpoint attachment over the endpoints
  present _so far_. Type-level, attachment threads
  `ApplyServices<M, R> = Exclude<R, Provides<M>> | Requires<M>` through the
  spec's accumulated requirements, and the error union is _derived_ rather
  than baked in: `Errors<Endpoint> = Error["Type"] | Middleware.Error<M>`,
  with the runtime wire schema built as a `Schema.Union` of the endpoint's
  error schema plus every attached middleware's `error` schema.
- **Implementation happens as a Layer on the server**:
  `Layer.succeed(Auth, (effect, options) => ...)`. The builder's environment
  demands the middleware service (plus its `Requires`) before the API can be
  served — a missing implementation is a type error, exactly like Confect's
  `GroupImpl.finalize`. At runtime the server iterates the middleware set in
  insertion order, each wrapping the previous result — so the last-attached
  middleware is outermost.
- **Client visibility.** Because attachment is in the spec, clients see
  middleware error types in each call's error union without importing any
  server code. Rpc middleware can additionally have a _client half_
  (`layerClient`, `requiredForClient` — e.g. attaching auth headers); Confect
  doesn't need this since the Convex client manages auth transport itself.

Designing to the v4 shape keeps Confect aligned with where Effect is going —
directly relevant given the `v10` branch tracks Effect v4.

### 3.2 `convex-helpers` custom functions

`customQuery`/`customMutation`/`customAction` wrap a function _builder_: shared
logic runs first, computes extra `ctx` fields (and can throw), and the handler
receives the enriched ctx. Strengths: dead simple, per-builder reuse.
Weaknesses (the gaps Confect middleware should close): errors are untyped
throws; "what's in ctx" is structural rather than service-based; there's no
type-level guarantee connecting a handler's needs to the wrappers applied to
it; and composition of multiple customizations is manual.

### 3.3 The #395 RFC shape

```ts
export const notes = GroupImpl.make(api, "notes").pipe(
  GroupImpl.middleware(requireUser),
  Layer.provide(listNotes),
  ...
);
```

The RFC gets the _requirements_ right (see §1, which is largely its list), and
the pipeable-impl ergonomics are attractive. But two of its stated desires are
in tension with each other:

1. _"Middleware should fail through Confect's normal typed error path"_ — but
   per constraint (a), typed errors that reach the client must be declared in
   the spec, and
2. _"This belongs in the implementation layer rather than the spec"_ — which
   makes middleware failures invisible to the spec and therefore to clients.

The resolution — the same one Effect chose — is to split middleware itself
into spec and impl halves: the _interface_ of a middleware (its name, what it
provides, how it can fail) is spec-level and client-safe; its _logic_ (database
indexes, identity lookup, internal functions) stays server-only. Auth details
don't leak: a `RequireUser` tag plus a `NotSignedIn` schema reveal nothing
about tables or providers.

Proposal A below is that resolution. Proposal B explores how far the
impl-only pipeable shape can be pushed, for completeness.

---

## 4. Proposal A (recommended): spec-declared middleware, impl-provided logic

Middleware becomes a first-class citizen of the spec/impl model, mirroring
`FunctionSpec`/`FunctionImpl`:

|                | Spec (shared, `@confect/core`) | Impl (server, `@confect/server`)                        |
| -------------- | ------------------------------ | ------------------------------------------------------- |
| Functions      | `FunctionSpec`                 | `FunctionImpl.make` → `Layer<FunctionImpl<Name>>`       |
| Groups         | `GroupSpec`                    | `GroupImpl.make` + `finalize`                           |
| **Middleware** | **`MiddlewareSpec.Service`**   | **`MiddlewareImpl.make` → `Layer<MiddlewareImpl<Id>>`** |

### 4.1 Declaring a middleware (shared code)

```ts
// confect/middleware/currentUser.ts — importable by client and server
import { MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import users from "../_generated/tables/users"; // table schemas are core-safe

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  "NotSignedIn",
  {},
) {}

export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser,
  { readonly user: typeof users.Doc.Type }
>() {}

export class RequireUser extends MiddlewareSpec.Service<
  RequireUser,
  {
    provides: CurrentUser; // type-level only, following v4
  }
>()("RequireUser", {
  error: () => NotSignedIn, // optional, lazy like FunctionSpec's `error`
  // kinds: ["query", "mutation", "action"]  (optional; default: all three)
}) {}
```

Following v4's `RpcMiddleware.Service`: `provides` (and, later,
cross-middleware `requires`) are pure type parameters in the `Config`
position; `error` is a runtime schema (declared lazily, matching
`FunctionSpec`); `kinds` is a Confect-specific runtime-and-type-level option
(see below). So the class carries four type-level facts: an identifier,
`Provides`, `Error`, and `Kinds`. Nothing here references server-only modules
— matching how Effect's middleware classes are client-safe.

`kinds` exists for middleware whose implementation strategy only makes sense
for some kinds (e.g. one that writes an audit row can declare
`kinds: ["mutation"]`). Attaching a middleware to a function of an undeclared
kind is a spec-level type error.

### 4.2 Attaching in the spec

```ts
// notes.spec.ts
export default GroupSpec.make()
  .middleware(RequireUser) // applies to every function declared in this group
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => Schema.Struct({ text: Schema.String }),
      returns: () => Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "delete_",
      args: () => Schema.Struct({ noteId: Id("notes") }),
      returns: () => Schema.Null,
      error: () => NoteNotFound,
    }).middleware(RequireAdmin), // function-level, runs after group middleware
  );
```

Type-level changes:

- `GroupSpec` gains a `Middlewares` type parameter (union of attached tags),
  `FunctionSpec` likewise. `.middleware()` are ordinary builder methods like
  `addFunction`, accumulating into those parameters.
- **Effective middleware** for a function = group's middleware (in attachment
  order) then the function's own. Deduplicated by tag identity, keeping the
  innermost (function-level) position — same rule `HttpApi` uses.

### 4.3 Client-side effect: the error union

`Ref.FromFunctionSpec` becomes group-aware (its call sites in
`Refs.ts`/`Registry.ts` already have the group at hand):

```ts
Error = FunctionSpec.Error<F> | MiddlewareSpec.Error<EffectiveMiddleware<G, F>>;
```

At runtime, `Ref.make` (called per function in `Refs.make` with the group in
scope) stores the effective middleware specs on the ref, and
`Ref.decodeErrorOption` decodes against
`Schema.Union(functionError, ...middlewareFailures)`. Client code then just
works — `useQuery(refs.public.notes.list)` surfaces
`NotSignedIn | NoteNotFound` in its error channel, with zero client-side API
changes. **This is the payoff of spec-level declaration: end-to-end typed
middleware errors for free.**

The same union is used server-side in `runHandlerPromise`'s allowlist, so a
middleware failure encodes into a `ConvexError` exactly like a declared
function error does today (and a function with no `error` schema but with
failing middleware gets an allowlist of just the middleware failures).

### 4.4 What handlers see

`Handler.WithName` widens `R` with the provides of the function's effective
middleware:

```ts
type R =
  | KindCtxServices<Schema, Kind>
  | MiddlewareSpec.Provides<EffectiveMiddleware<G, F>>;
```

So this type-checks _only_ when `RequireUser` is attached to `create` (or its
group) in the spec — the exact guarantee #395 asks for, enforced at the
`FunctionImpl.make` call site rather than "somewhere during assembly":

```ts
const create = FunctionImpl.make(databaseSchema, notes, "create", ({ text }) =>
  Effect.gen(function* () {
    const { user } = yield* CurrentUser;
    const writer = yield* DatabaseWriter;
    return yield* writer.table("notes").insert({ text, userId: user._id });
  }),
);
```

Handler `E` is unchanged (the declared `error` schema type); middleware
failures never pass through handler code.

A pleasant consequence for testing: since handlers consume plain services,
unit tests don't need middleware machinery at all —
`Effect.provideService(CurrentUser, { user: fakeUser })` and done.

### 4.5 Implementing a middleware (server code)

Following v4, the middleware implementation is **wrap-style**: a function that
receives the downstream effect (remaining middleware + handler) and decides
whether and how to run it.

```ts
// notes.impl.ts (or a shared middleware/currentUser.impl.ts)
const RequireUserLive = MiddlewareImpl.make(
  databaseSchema,
  RequireUser,
  (effect, { spec, args }) =>
    Effect.gen(function* () {
      const auth = yield* Auth;
      const reader = yield* DatabaseReader;

      const identity = yield* auth.getUserIdentity.pipe(
        Effect.mapError(() => new NotSignedIn()),
      );
      const user = yield* reader
        .table("users")
        .index("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .first()
        .pipe(Effect.mapError(() => new NotSignedIn()));

      return yield* Effect.provideService(effect, CurrentUser, { user });
    }),
);
```

The implementation function is typed (borrowing v4's two safety brands):

```ts
(
  effect: Effect<SuccessValue, Error | unhandled, Provides>,
  options: { spec: FunctionSpec.AnyWithProps; args: unknown },
) => Effect<SuccessValue, Error | unhandled, R>;
```

- `SuccessValue` is opaque — middleware cannot inspect or replace the
  handler's return value, so the return contract can't be corrupted.
- `unhandled` is a branded error type — errors the middleware doesn't declare
  pass through opaquely and cannot be absorbed.
- `Provides` sits in the incoming effect's environment, so the _type checker_
  forces the implementation to `Effect.provideService` it (or never run
  `effect`) — provides is an obligation, not runtime magic.
- Short-circuiting is simply returning `Effect.fail(new NotSignedIn())`
  without running `effect`.
- `R` must be a subset of the **intersection of the ctx-service unions of the
  tag's declared `kinds`** (computed against the app's `databaseSchema`). For
  the default all-kinds tag that intersection is
  `Auth | StorageReader | QueryRunner` — which is exactly enough for the
  canonical kind-generic strategy: load the user via `QueryRunner` and an
  internal query, one implementation for all three kinds (constraint (e)). A
  `kinds: ["query", "mutation"]` tag may additionally use `DatabaseReader`
  (which is what makes the example above legal); a mutation-only tag may use
  `DatabaseWriter`.

Since the flagship use case (auth) is "run something, provide a service",
a provides-shaped constructor is worth offering as sugar over the wrap
primitive:

```ts
const RequireUserLive = MiddlewareImpl.provides(
  databaseSchema,
  RequireUser,
  CurrentUser,
  Effect.gen(function* () {
    // ...same body as above...
    return { user }; // the CurrentUser service value
  }),
);
```

which desugars to `(effect) => Effect.provideServiceEffect(effect, CurrentUser, body)`.
(The `CurrentUser` tag is passed explicitly because, per v4, the spec class
only knows `provides` at the type level.)

A second convenience for when one strategy doesn't fit all kinds (the RFC's
per-kind triple, as sugar rather than core mechanism — each entry may use that
kind's full ctx union):

```ts
const RequireUserLive = MiddlewareImpl.makeByKind(databaseSchema, RequireUser, {
  query: viaDatabaseReader,
  mutation: viaDatabaseReader,
  action: viaQueryRunner,
});
```

### 4.6 Group assembly and enforcement

`MiddlewareImpl.make` returns `Layer<MiddlewareImpl<"RequireUser">>` and, like
`FunctionImpl.make`, registers its implementation into the group's `Registry`
as a middleware-shaped item. `GroupImpl.make`'s input requirement grows to

```ts
Layer<
  GroupImpl<"Unfinalized">,
  never,
  FunctionImpl.FromGroupSpec<Group> | MiddlewareImpl.FromGroupSpec<Group>
>;
```

so the existing `finalize` (`RIn = never`) mechanism rejects a group that
attaches `RequireUser` in its spec but never provides `RequireUserLive`:

```ts
export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(create),
  Layer.provide(delete_),
  Layer.provide(RequireUserLive), // omitting this is a compile error at finalize
  GroupImpl.finalize,
);
```

Shared middleware implementations are just exported layers provided to many
groups — reuse falls out of the existing Layer model.

### 4.7 Runtime composition

In `RegisteredConvexFunction.make` (and the node-action equivalent), after args
decode, before the handler — per invocation, mirroring v4's `applyMiddleware`
loop:

```ts
// effective chain [group..., function...]; iterate innermost-first so that
// group middleware ends up outermost (runs first):
let effect = handler(decodedArgs);
for (const m of effectiveMiddleware.toReversed()) {
  effect = registryImpls.get(m.key)(effect, {
    spec: functionSpec,
    args: decodedArgs,
  });
}
```

Each middleware runs once per invocation, in order, around the handler; a
failure short-circuits (inner middleware and the handler never run) and flows
into the same error channel `runHandlerPromise` encodes. Middleware
implementations execute inside the same fiber and layer scope as the handler,
so the query `Clock` stubbing and `ConfigProvider` setup apply to them
unchanged.

The error channel of the composed effect is
`FunctionError | m1.Error | m2.Error`, matching the ref's error union in §4.3
and the runtime allowlist union.

Since the primitive is wrap-style, everything the RFC lists falls out of one
shape: inspecting decoded args (they're in `options`), short-circuiting,
providing services, running code after the handler (logging, timing, metrics),
and translating errors — e.g.:

```ts
export class Timed extends MiddlewareSpec.Service<Timed>()("Timed") {}

const TimedLive = MiddlewareImpl.make(
  databaseSchema,
  Timed,
  (effect, { spec }) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis;
      const result = yield* effect;
      const end = yield* Clock.currentTimeMillis;
      yield* Effect.log(`${spec.name} took ${end - start}ms`);
      return result;
    }),
);
```

(One Convex-specific caveat worth documenting: inside cached queries the
`Clock` service is an explicit opt-in to cache invalidation — see the
`unpatchedClock` note in `RegisteredConvexFunction.ts` — so a timing
middleware on queries trades away cacheability, exactly as it would if written
inline.)

### 4.8 What this does _not_ cover (deliberately)

- **Convex-provenance functions** (`FunctionSpec.convexPublicQuery` etc.):
  their handlers are raw `RegisteredFunction`s that Confect passes through
  untouched; middleware doesn't apply. Type-level: attaching middleware to a
  group affects only Confect-provenance functions; whether to make attaching
  to a convex-provenance function's group a type error or a silent skip is an
  open question (§7).
- **HTTP API middleware**: Confect's HTTP API already exposes Effect's own
  `HttpApp`/`HttpApiMiddleware` machinery; nothing new needed.
- **Client-side middleware** (Rpc's `requiredForClient`): the Convex client
  owns transport and auth headers, so there's no client half. If a use case
  appears later, the tag-based design leaves room for it.

---

## 5. Proposal B: impl-level pipeable middleware (the #395 shape, analyzed)

For fidelity to the RFC, here is how far the impl-only shape can be taken:

```ts
const requireUser = Middleware.make(
  Effect.gen(function* () { ... return CurrentUser.of({ user }) }),
  { provides: CurrentUser },
);

export default GroupImpl.make(databaseSchema, notes).pipe(
  GroupImpl.middleware(requireUser),
  Layer.provide(create),
  GroupImpl.finalize,
);
```

Mechanics: `FunctionImpl.make` would accept handlers with extra requirements
beyond the ctx union, surfacing the excess as a phantom requirement on the
produced layer (`Layer<FunctionImpl<Name>, never, Provided<CurrentUser>>`);
`GroupImpl.middleware(mw)` would both (runtime) rewrite registry items to wrap
handlers and (type-level) eliminate `Provided<mw.Provides>` from the group
layer's requirements; `finalize`'s `RIn = never` bound then catches unprovided
services. Function-level middleware would be a pipeable on the function impl
layer.

This is implementable, and its handler-side guarantee ("handler requiring
`CurrentUser` fails unless some middleware provides it") lands at `finalize`
rather than at the handler's own definition site. But it has two structural
shortcomings:

1. **No typed errors on the client** (constraint (a)). A middleware failure
   has no spec-declared schema, so the only sound options are: die (opaque
   server error, breaking the "typed error path" requirement), or constrain
   each middleware's failure type to be a subtype of _every attached
   function's_ declared error union — which inverts the dependency (every
   function's spec must re-declare auth errors) and is exactly the "adding
   this to a union on error type would be unfortunate" outcome the RFC itself
   wants to avoid.
2. **Weaker locality.** Because attachment is a value-level `pipe` after the
   fact, the handler's environment can't be precisely narrowed per function at
   its definition site; errors surface later and farther from the cause, and
   tooling (codegen, docs, clients) can't see middleware at all.

Verdict: the pipeable _ergonomics_ are worth keeping in mind, but as the
foundation it forfeits end-to-end error typing, which is Confect's core value
proposition. Not recommended as the primary mechanism.

## 6. Proposal C: minimal context-provider layers (a stepping stone)

A much smaller feature that covers a useful slice: let impls attach
per-invocation _service layers_ with no failure channel and no spec presence:

```ts
export default GroupImpl.make(databaseSchema, notes, {
  provide: [CurrentUserLive], // Layer<CurrentUser, never, QueryServices> — E = never; failures must be defects
}).pipe(...)
```

Handlers gain the provided services in `R` (computable since the layers are
passed to `GroupImpl.make`/`FunctionImpl.make` directly rather than piped
later). Anything that can fail must either die or be modeled as a service
whose _methods_ fail (e.g. provide `CurrentUser` as
`Effect<User, NotSignedIn>`-returning accessor, and let handlers surface the
failure through their own declared errors).

This is essentially `customFunction`s translated to services: cheap to build,
no spec changes, no client changes — and strictly subsumed by Proposal A. Its
main value would be shipping context-enrichment quickly if A's spec surface
needs longer to bake. If A is accepted, C should not exist as a separate
public concept.

## 7. Comparison and recommendation

|                                                                | A: spec-declared                                                      | B: impl-pipeable                      | C: provider layers                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Typed middleware errors on the client                          | ✅ automatic                                                          | ❌ die or per-function re-declaration | ❌ defects only                      |
| Handler `R` narrowed per function, at definition site          | ✅                                                                    | ⚠️ at `finalize`                      | ✅                                   |
| Missing-impl caught at compile time                            | ✅ via `finalize` (existing pattern)                                  | ✅                                    | n/a                                  |
| Group + function level, ordered                                | ✅                                                                    | ✅                                    | ⚠️ group-level natural, ordering n/a |
| Function kinds                                                 | `kinds` on tag + R-subset check; `QueryRunner` for kind-generic impls | same idea possible                    | same idea possible                   |
| Wrap (logging/timing/retry)                                    | ✅ core primitive                                                     | ✅                                    | ❌                                   |
| Alignment with Effect v4 (`HttpApiMiddleware`/`RpcMiddleware`) | ✅ same architecture                                                  | ❌ novel                              | ❌ novel                             |
| Spec surface growth                                            | new `MiddlewareSpec` + 2 builder methods                              | none                                  | none                                 |
| Client/codegen changes                                         | error-union type plumbing only                                        | none                                  | none                                 |

**Recommendation: Proposal A**, delivered in phases:

1. **Phase 1**: `MiddlewareSpec.Service` (provides + error + kinds), the
   wrap-style primitive with the `MiddlewareImpl.provides` sugar,
   `GroupSpec.middleware`, registry/build wiring, error-union plumbing through
   `Ref`/`Refs`, handler `R` widening. This alone satisfies nearly every
   requirement in §1.
2. **Phase 2**: function-level `.middleware()` on `FunctionSpec`,
   `makeByKind`.
3. **Phase 3** (as demand appears): cross-middleware dependencies (a
   `requires` slot in the `Config` type parameter, as in v4's
   `ApplyServices`). Note v4 deliberately dropped `optional` middleware — a
   wrap middleware decides for itself whether to run `effect` when its checks
   fail — so Confect never needs that concept.

The RFC's desired-behavior checklist (§1) is fully covered by phases 1–2; the
one departure from the RFC is _where_ middleware is declared, and §3.3/§5
argue that departure is forced by Confect's own end-to-end typing goals — the
spec half of a middleware is precisely its client-relevant interface (name +
error + provides), while every server detail stays in the impl half.

## 8. Open questions

1. **Subgroup propagation.** Should `GroupSpec.middleware` apply to subgroups
   added via `addGroup`/`addGroupAt`? Leaf groups are implemented and built in
   isolation (per-group `Registry`), so inherited middleware would complicate
   the codegen boundary. Suggested initial answer: no propagation — middleware
   applies to the declaring group's own functions; revisit if group nesting
   grows into a namespacing-plus-policy mechanism.
2. **Duplicate attachment semantics.** Same tag at group and function level:
   dedupe keeping innermost (proposed, matches `HttpApi`), or error?
3. **Convex-provenance functions in a middleware-bearing group**: type error
   or documented no-op? (Suggested: type error on `.middleware()` when the
   group contains any convex-provenance function whose kind matches, to avoid
   silent policy holes; needs ergonomics validation.)
4. **Middleware ordering across group→function boundary when a wrap
   middleware provides a service consumed by a later provides-middleware.**
   Phase-3 concern; likely resolved by validating attachment order against
   declared `requires`.
5. **Effect version target.** Nothing here requires v4 — `Context.Tag`,
   `Layer`, and `Effect.provideServiceEffect` all exist in v3 — but the
   feature is a natural headline for the v10 line (Effect v4), and building it
   there first avoids implementing the type plumbing twice against two Schema
   majors. Worth deciding before Phase 1 starts.
6. **Naming.** `MiddlewareSpec`/`MiddlewareImpl` follows the repo's existing
   Spec/Impl vocabulary; a single `Middleware` module with `.Service` +
   `Layer`-based provision would follow Effect v4's. The former seems more at
   home in Confect.
7. **Group-attachment semantics.** This proposal keeps group middleware as its
   own type parameter on `GroupSpec` (order-independent, applies to all of the
   group's functions), whereas v4's group `.middleware()` is a fan-out that
   only affects endpoints added _before_ the call. The declarative variant
   seems less surprising for Confect specs, but following v4 exactly is a
   defensible alternative — worth a deliberate decision.
