# Database triggers for Confect — prior art review and API proposals

**Status:** design exploration. API surface only — implementation strategy is
deliberately out of scope except where a design choice has a cost that would be
dishonest to omit.

---

## 1. What a trigger API has to decide

Every trigger system in the wild resolves the same eight questions. Naming them
up front makes the prior-art comparison legible and gives the proposals a shared
vocabulary.

| # | Axis | The two poles |
|---|------|---------------|
| 1 | **Timing** | Synchronous/in-transaction vs. out-of-band/eventually-consistent |
| 2 | **Position** | `BEFORE` (can rewrite the write) vs. `AFTER` (observe only) |
| 3 | **Granularity** | Per-row vs. per-statement/batch |
| 4 | **Registration site** | Colocated with the schema vs. a central registry vs. ambient/global |
| 5 | **Enforcement** | Unbypassable (the writer *is* the triggered writer) vs. opt-in wrapper |
| 6 | **Change shape** | One tagged union vs. one callback per operation |
| 7 | **Recursion** | Off / immediate (DFS) / queued (BFS), with or without a depth bound |
| 8 | **Failure** | Abort the write, abort the transaction, or log and continue |

---

## 2. Prior art

### 2.1 `convex-helpers/server/triggers` — the direct precedent

Read from source (`convex-helpers@0.1.120`, `server/triggers.ts`).

```ts
const triggers = new Triggers<DataModel>();
triggers.register("users", async (ctx, change) => {
  // ctx.db      → re-entrant writer (writes here fire more triggers)
  // ctx.innerDb → raw writer (bypasses triggers)
  // change: { id, operation: "insert" | "update" | "delete", oldDoc, newDoc }
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

Semantics, as implemented:

- **Timing/position:** AFTER, in-transaction. Atomic with the write.
- **Granularity:** per-row.
- **Change shape:** `operation` string discriminator with `oldDoc: null` on
  insert and `newDoc: null` on delete — nullable fields rather than a union that
  makes illegal states unrepresentable.
- **Recursion:** queued BFS. Two module-level locks (`innerWriteLock`,
  `outerWriteLock`) plus a module-level `triggerQueue` serialize writes so the
  `change` can be computed without interference. The outermost application write
  holds the outer lock and drains the whole queue before returning.
- **Failure:** the first error is rethrown after the queue drains (subsequent
  ones are `console.error`'d). Convex rolls back **unless the mutation catches
  the error**, in which case the writes commit and the trigger's effects don't —
  the sharpest edge in the whole design.
- **Enforcement:** opt-in. You must remember to define every mutation with the
  wrapped `mutation`. One `import { mutation } from "./_generated/server"` and
  the trigger silently doesn't run.
- **Cost:** `patch`/`replace`/`delete` each do an extra `get` before the write to
  materialize `oldDoc`. Untabled ID overloads (`db.patch(id, …)` without a table
  name) require `_tableNameFromId`, which loops over every registered table
  calling `normalizeId`.

The [Stack article](https://stack.convex.dev/triggers) is refreshingly candid
about the downsides: triggers are "spooky action at a distance", they don't fire
for dashboard edits or `convex import`, cascading deletes can blow the mutation
size limit, and denormalized counters on a single document create OCC contention.

**Steal:** in-transaction atomicity; the re-entrant/raw writer pair; recursion as
a first-class, documented behavior rather than an accident.
**Avoid:** opt-in wiring; nullable `oldDoc`/`newDoc`; unnamed triggers;
module-level mutable locks; "caught error commits partial state".

### 2.2 `@convex-dev/aggregate` — triggers as exported values

```ts
const byUser = new TableAggregate<{ … }>(components.aggregate, { … });
triggers.register("notes", byUser.trigger());        // or .idempotentTrigger()
```

The important lesson isn't the aggregation — it's that a **trigger is a value a
library can export**. Any Confect design that only accepts inline closures in a
central file makes this pattern impossible.

### 2.3 Convex + Better Auth — the config-object shape

```ts
triggers: {
  user: {
    onCreate: async (ctx, doc) => {},
    onUpdate: async (ctx, newDoc, oldDoc) => {},
    onDelete: async (ctx, doc) => {},
  },
}
```

Per-operation callbacks instead of a union. Ergonomically nicer for the ~80% case
where you only care about one operation, and it removes the nullable fields. Pays
for it by making "do the same thing on any change" awkward and by having no name
per hook.

**Steal:** per-operation entry points. **Note:** they are sugar, not a
replacement for a union — cascade/audit triggers genuinely want all three.

### 2.4 `convex-ents` — declarative, not imperative

Deletion behavior is declared on the schema (`.deletion("soft")`,
`.deletion("scheduled", { delayMs })`, `deletion: "hard"` on edges) and the
runtime derives cascades from the edge graph. There is no user callback at all
for the most common trigger use case.

**Steal:** the observation that *cascading delete* and *derived field* are common
enough to deserve declarative spellings that can't loop or drift, rather than
being hand-rolled in every project.

### 2.5 PostgreSQL — the reference semantics

```sql
CREATE TRIGGER audit_users
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION audit();
```

Notable pieces no JS library copies: triggers are **named** (so they can be
dropped, reordered, reported on); firing order is alphabetical by name and
therefore deterministic; `WHEN` is a declarative guard evaluated *before* the
function is called; `FOR EACH STATEMENT` with transition tables gives batch
granularity; `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` defers to
commit time so that transient invariant violations mid-transaction are legal;
`pg_trigger_depth()` gives recursion introspection. SQLite ships recursive
triggers *off* by default (`PRAGMA recursive_triggers`); MySQL restricts
recursive activation outright.

**Steal:** required names; a declarative `when` guard; explicit recursion policy;
deferred-until-commit as a genuinely useful third timing mode.

### 2.6 Gel / EdgeDB — the modern declarative take

```
trigger log_update after update for each
  when (__new__.status != __old__.status)
  do (insert AuditLog { … });
```

`for each` vs. `for all` is the row/statement axis stated cleanly; `__new__` /
`__old__` are sets in `for all` mode. Compiled into the triggering query, so
atomicity is structural rather than promised.

### 2.7 Payload CMS, TypeORM, Rails, Django, Sequelize, Prisma

- **Payload** hooks are arrays per lifecycle phase in the collection config
  (`beforeValidate`, `beforeChange`, `afterChange`, `beforeDelete`,
  `afterDelete`, `afterRead`), each receiving `{ data, doc, previousDoc, operation,
  req, context }`. `context` is a per-request scratchpad explicitly designed as
  the loop-breaker between hooks. **Steal:** the per-request context bag idea, and
  the `beforeChange` phase that returns modified data instead of patching after
  the fact.
- **TypeORM** subscribers get `UpdateEvent.updatedColumns` — the changed-field
  set, for free.
- **Rails** `before_/after_/around_` callbacks with `throw :abort` to halt. The
  community's own retrospective is instructive: callbacks are the canonical
  "hard to test, hard to trace" Rails anti-pattern once more than one fires.
- **Django** signals decouple registration entirely (`post_save.connect(...)`),
  which produces the classic "is my handler even imported?" failure. `update_fields`
  again supplies the changed-field set.
- **Sequelize** distinguishes row hooks from bulk hooks and makes you opt into
  `individualHooks: true` — a live reminder that bulk paths silently skip
  per-row hooks in most ORMs.
- **Prisma** removed `$use` middleware in favor of `$extends({ query: … })`, an
  **around**-interceptor: you receive `{ model, operation, args, query }` and
  call `query(args)` yourself. Strictly more powerful than before/after pairs
  (retries, short-circuits, RLS) and fully type-safe, at the cost of being
  invisible in the schema.

### 2.8 Out-of-band systems (Firestore, Hasura, DynamoDB Streams)

Firestore's `onDocumentWritten("users/{userId}", …)` with `event.data.before /
after`, Hasura event triggers with per-column `update: { columns: [...] }`
filters and configurable retries, DynamoDB Streams → Lambda. All at-least-once,
all eventually consistent, none atomic with the write.

**Relevance to Confect:** this mode is *worth having* — sending a welcome email
shouldn't run inside the transaction — and Convex gives it to us for free, because
`scheduler.runAfter` is itself transactional. A scheduled trigger is exactly-once
*and* out-of-band, which none of the above systems can offer.

---

## 3. What Confect uniquely enables

Before proposing anything: the reason not to just port `convex-helpers` is that
Confect's architecture removes four of that design's constraints outright.

1. **Confect owns writer construction.** `RegisteredConvexFunction.mutationLayer`
   builds `DatabaseWriter.layer(schema, ctx.db)` for every Confect mutation.
   Triggers can be woven in there, so there is **no `customMutation` to
   remember** and no way to accidentally define an untriggered mutation. This
   fixes the single biggest flaw in the precedent.
2. **Writes are already table-scoped.** `writer.table("notes").insert(…)` means
   dispatch is a record lookup. No `_tableNameFromId` scan, no ID-overload
   ambiguity.
3. **`patch` already reads the old document.** `DatabaseWriter.patch` does a
   `getById` → merge → `replace`. `oldDoc` for the most common mutating operation
   costs nothing extra, and it's *already decoded*.
4. **Documents are schema-decoded.** A Confect trigger can receive
   `Document.Document<Schema, "notes">` — branded IDs, `Option`s, classes, dates —
   not raw Convex values. Every other system on this list hands you the wire
   format.

And two more that follow from Effect: handlers are `Effect`s, so they compose,
get spans and structured logs for free, and can declare their service
requirements in the type; and typed error channels make "what can this trigger do
to my write?" a question the type system can answer (§6.3).

---

## 4. Shared vocabulary (common to all proposals)

Two new modules in `@confect/server`, mirroring the existing `CronJob` /
`CronJobs` pair.

```ts
// @confect/server/Change
export type Change<S extends DatabaseSchema.AnyWithProps, T extends DatabaseSchema.TableNames<S>> =
  | Change.Insert<S, T>
  | Change.Update<S, T>
  | Change.Delete<S, T>;

export declare namespace Change {
  interface Insert<S, T> {
    readonly _tag: "Insert";
    readonly table: T;
    readonly id: GenericId<T>;
    readonly newDoc: Document.Document<S, T>;
  }
  interface Update<S, T> {
    readonly _tag: "Update";
    readonly table: T;
    readonly id: GenericId<T>;
    readonly oldDoc: Document.Document<S, T>;
    readonly newDoc: Document.Document<S, T>;
    /** Which writer method produced this update. */
    readonly via: "patch" | "replace";
  }
  interface Delete<S, T> {
    readonly _tag: "Delete";
    readonly table: T;
    readonly id: GenericId<T>;
    readonly oldDoc: Document.Document<S, T>;
  }
}

/** `Match.tag`-compatible; also `Change.match({ onInsert, onUpdate, onDelete })`. */
```

`_tag` (not `operation`) so `Match.tag` / `Match.tags` work directly, and no
nullable `oldDoc` / `newDoc`. `via` is carried because "was this a patch or a
full replace?" is cheap to record and occasionally load-bearing (audit logs).

The handler type is just "a mutation-shaped Effect":

```ts
// @confect/server/Trigger
export type Handler<S, T> = (
  change: Change<S, T>,
) => Effect.Effect<void, never, RegisteredConvexFunction.MutationServices<S>>;
```

Because `R` is exactly `MutationServices<S>`, a trigger body is
indistinguishable from a mutation impl body — same `DatabaseReader`,
`DatabaseWriter`, `Scheduler`, `Auth`, `MutationCtx`, everything. Nothing new to
learn.

---

## 5. The proposals

### Proposal A — central `confect/triggers.ts` registry ★ recommended baseline

A new well-known top-level file alongside `confect/crons.ts` and
`confect/http.ts`, discovered by the CLI.

```ts
// confect/triggers.ts
import { Trigger, Triggers } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";

export default Triggers.make(databaseSchema)
  // per-operation sugar, the common case
  .onDelete("users", "cascadeNotes", ({ oldDoc }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;

      const notes = yield* reader
        .table("notes")
        .index("by_user", (q) => q.eq("userId", oldDoc._id))
        .collect();

      yield* Effect.forEach(notes, (note) => writer.table("notes").delete(note._id), {
        discard: true,
      });
    }).pipe(Effect.orDie),
  )
  // full union, for triggers that care about every operation
  .on("notes", "auditLog", (change) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      yield* writer.table("auditLog").insert({
        table: change.table,
        docId: change.id,
        kind: change._tag,
      });
    }).pipe(Effect.orDie),
  )
  // library-authored triggers are first-class values
  .add(notesByUser.trigger(databaseSchema, "notes", "aggregate"));
```

Standalone construction, for triggers defined elsewhere (a component, a shared
package, a colocated module):

```ts
export const cascadeNotes = Trigger.onDelete(
  databaseSchema,
  "users",
  "cascadeNotes",
  ({ oldDoc }) => …,
);
```

Wiring: the CLI discovers `confect/triggers.ts`, emits
`confect/_generated/triggers.ts`, and threads it into the mutation layer. Users
write no wiring code, and there is no untriggered `DatabaseWriter` to reach for
by accident.

**Why names are required.** Every trigger carries a stable identifier (`"cascadeNotes"`).
It buys: deterministic firing order independent of object-key iteration; a span
name (`confect.trigger cascadeNotes`) and log annotation for free; actionable
error messages ("trigger `cascadeNotes` on `users` exceeded max depth 16");
CLI-reportable inventory; and a handle for a future per-test disable API.
Postgres and Gel both require names; no JS library does, and every one of them is
harder to debug for it.

**Pros.** One place to look. Unbypassable. Trigger values are exportable and
composable. Matches the existing `CronJobs.make().add(…)` idiom exactly. No new
concepts.
**Cons.** Not colocated with the table it fires on. The central file imports every
trigger's dependencies (see §7 for the bundling consequence).

---

### Proposal B — colocated `confect/tables/<name>.triggers.ts`

Confect already keys behavior off filename suffixes (`.spec.ts`, `.impl.ts`).
Extend the convention: a table's triggers live next to the table.

```ts
// confect/tables/notes.triggers.ts
import { Triggers } from "@confect/server";
import databaseSchema from "../_generated/schema";
import { DatabaseWriter } from "../_generated/services";

export default Triggers.forTable(databaseSchema, "notes")
  .onInsert("bumpUserNoteCount", ({ newDoc }) => …)
  .onDelete("dropUserNoteCount", ({ oldDoc }) => …);
```

Codegen collects `confect/tables/*.triggers.ts` into
`confect/_generated/triggers.ts`. The table name is fixed by the filename, so it
never appears in the body.

**Pros.** Locality — the schema and the invariants that maintain it sit side by
side. Fits the established naming conventions. One module per table gives the
bundler a finer-grained unit.
**Cons.** A cascade that spans tables (delete `users` → delete `notes`) has to
live in one of the two files and reads oddly in either. Cross-table invariants
get scattered. Discovering "everything that happens when I write" requires
opening N files.

**Rejected sub-variant: triggers on the `Table` itself**
(`Table.make(…).onInsert(…)`). It looks tempting and it is a trap:
`confect/tables/notes.ts` would have to import `_generated/services`, which
imports `_generated/schema`, which imports `confect/_generated/tables/notes` —
a module cycle. It also breaks the `Table`-is-pure-data property that
`REVIEW.md` protects, and would drag trigger bodies into every **query** bundle
via the schema import. A/B keep the table module a pure description.

> A and B are not exclusive: `Triggers.make(schema)` can accept both `.add(trigger)`
> and merged per-table registries. Shipping A first and adding B as an optional
> layout later is a coherent path.

---

### Proposal C — full spec/impl split

The maximally Confect-native option: triggers get the same treatment as
functions.

```ts
// confect/triggers.spec.ts
export class CascadeFailed extends Schema.TaggedError<CascadeFailed>()(
  "CascadeFailed", { userId: Id("users") },
) {}

export default TriggerSpec.make()
  .add(TriggerSpec.onDelete({ table: "users", name: "cascadeNotes", error: () => CascadeFailed }))
  .add(TriggerSpec.on({ table: "notes", name: "auditLog" }));

// confect/triggers.impl.ts
const cascadeNotes = TriggerImpl.make(databaseSchema, triggers, "cascadeNotes", ({ oldDoc }) => …);
const auditLog = TriggerImpl.make(databaseSchema, triggers, "auditLog", (change) => …);

export default TriggersImpl.make(databaseSchema, triggers).pipe(
  Layer.provide(cascadeNotes),
  Layer.provide(auditLog),
  TriggersImpl.finalize,
);
```

**Pros.** Perfectly consistent with `GroupSpec`/`GroupImpl`. The
`finalize`-requires-all-impls trick means a declared trigger with no
implementation is a *type error*, exactly as for functions. Declared `error`
schemas are what make §6.3 (typed trigger failures at the write site) tractable.
Reviewable inventory of every side effect in the project.
**Cons.** Heavy. A trigger is usually five lines; two files and a layer
composition to host them is a poor ratio. And the spec/impl split exists because
function specs are a *published deployment contract* — clients import refs from
them. Triggers have no external contract at all; they are pure implementation.
Applying the ceremony without the payoff is the wrong trade for v1.

**Verdict:** the right shape *if and only if* typed trigger errors (§6.3) become
a goal. Otherwise A is the same thing with a tenth of the surface.

---

### Proposal D — writer interception layer (Prisma `$extends` analogue)

Not a registry at all — a `Layer` that wraps the `DatabaseWriter` service.

```ts
export const withAudit = DatabaseWriter.intercept(
  (op, proceed) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("write", { table: op.table, method: op._tag });
      return yield* proceed;   // around-interceptor: may skip, retry, or replace
    }),
);
```

**Pros.** Purely Effect-native, zero codegen, arbitrary composition order via
`Layer` composition. Strictly more powerful than after-hooks: short-circuit,
retry, rewrite, soft-delete-by-rewriting-`delete`-as-`patch`, row-level security.
**Cons.** Invisible — nothing in the project tells you a write is intercepted.
Composition order is `Layer` order, which is subtle. And it's the wrong altitude
for "when a user is deleted, delete their notes", which is 95% of demand.

**Verdict:** not the primary API, but a genuinely useful **substrate**. A and B
can both be implemented as an interceptor, and exposing the interceptor publicly
gives power users an escape hatch without bending the trigger API to cover
retries and RLS.

---

## 6. Cross-cutting semantics

These decisions are orthogonal to which of A–D ships.

### 6.1 Recursion

```ts
Triggers.make(databaseSchema, {
  recursion: "immediate",  // "immediate" (DFS) | "queued" (BFS) | "off"
  maxDepth: 16,
});
```

Recommend **`"immediate"`** as the default: `writer.table("notes").delete(id)`
does not complete until its triggers, and their triggers, have completed. It
matches the call-stack shape the code already has, so an Effect stack trace and a
span tree both read correctly. `convex-helpers` chose BFS to preserve
write-order == trigger-order across sibling triggers; that's a defensible
alternative and is worth keeping as an option, but it requires module-level
mutable queue state that Effect can express more honestly as a `FiberRef`.

`maxDepth` is a bounded failure instead of a hang. Postgres exposes
`pg_trigger_depth()`; SQLite defaults recursion *off*. A silent infinite cascade
is the worst outcome, so bound it and name the offender in the message.

### 6.2 Failure — closing the "caught error commits" hole

`convex-helpers`'s sharpest edge: if the mutation body catches the error a
trigger threw, the writes commit but the trigger's effects don't. In Effect this
would be *easier* to hit — `Effect.either`, `Effect.catchAllDefect`, and
`Effect.orElse` around a write all swallow it.

Proposal: **poison-pill semantics.** A trigger failure sets a fiber-scoped flag
in addition to failing the write. `mutationFunction` checks the flag after the
handler returns and dies regardless of what the handler did with the error. A
trigger failure becomes genuinely unrecoverable-within-the-mutation, which is
what "atomic with the write" ought to mean. This is a correctness improvement
over every system surveyed.

### 6.3 The error channel — `never` now, typed later

**v1: `Effect<void, never, MutationServices<S>>`.** Triggers use `Effect.orDie`,
exactly as the example impls already do. Write-site signatures are unchanged.

**Possible v2:** thread a `TriggerErrors` type parameter through `DatabaseWriter`
the same way `Docs` already is in `_generated/services.ts`, so that

```ts
writer.table("users").delete(userId)
// Effect<void, CascadeFailed>   ← the trigger's declared failure, at the call site
```

No trigger system in any language does this. It would be a real differentiator,
and it is the payoff that would justify Proposal C's spec/impl ceremony. It is
also where the type-level plumbing gets hard (the generated `services.ts` would
need trigger error types, and trigger modules import `services.ts` — a type-only
cycle) and where the write-site signature churn is most viral. Explicitly a
follow-up, not v1.

### 6.4 Re-entrancy and the escape hatch

Inside a trigger, `yield* DatabaseWriter` yields a **re-entrant** writer: writes
fire further triggers, subject to `recursion`/`maxDepth`. For the loop-breaking
case (the denormalized-counter patch that must not re-fire its own trigger),
provide a scoped modifier rather than a second service tag:

```ts
Trigger.untriggered(
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    yield* writer.table("users").patch(userId, { noteCount });
  }),
);
```

This is `convex-helpers`'s `ctx.innerDb` expressed as a scoped service swap. It
keeps the common path a single well-known tag and makes the bypass a visible,
greppable, reviewable construct at exactly the point where it matters.

### 6.5 Declarative guards

Two combinators, borrowed from Postgres `WHEN`, Gel `when`, Hasura's per-column
filters, and TypeORM's `updatedColumns`:

```ts
Trigger.when((change) => change._tag === "Update" && change.newDoc.status === "published")
Trigger.whenChanged(["status", "assigneeId"])   // updates only; field-level equivalence
```

`whenChanged` is the one worth building. "Fire only when this field changed" is
the single most common trigger predicate, and hand-rolling it against decoded
documents (branded IDs, `Option`s, classes) means reaching for
`Schema.equivalence` — which Confect can do once, correctly, per field.

### 6.6 Out-of-band triggers

Convex's scheduler is transactional, so a scheduled trigger is out-of-band *and*
exactly-once — something Firestore, Hasura, and DynamoDB Streams cannot offer.
Worth a first-class spelling so that "send the welcome email" doesn't run inside
the transaction:

```ts
Triggers.make(databaseSchema).schedule(
  "users", "welcomeEmail",
  Trigger.onInsert(({ newDoc }) => ({ userId: newDoc._id })),
  refs.internal.email.sendWelcome,
);
```

Desugars to `Scheduler.runAfter(Duration.zero, ref, args)`. Two lines instead of
ten, and it steers people away from doing slow work inline.

### 6.7 BEFORE-position triggers (deferred)

Payload's `beforeChange`, Rails' `before_save`, and Postgres `BEFORE … FOR EACH
ROW` all let the hook rewrite the document. The `convex-helpers` docs' own
derived-field example (`fullName` from `firstName`/`lastName`) has to patch
*after* the insert and then guard against re-triggering itself — boilerplate that
a BEFORE hook eliminates entirely.

```ts
Trigger.beforeWrite("users", "deriveFullName", ({ doc }) =>
  Effect.succeed({ ...doc, fullName: `${doc.firstName} ${doc.lastName}` }),
);
```

Attractive, and cleanly expressible on Proposal D's substrate. Deferred because
it widens the surface considerably (what does `beforeWrite` mean for `delete`?
can it veto?) and because AFTER covers the demand.

### 6.8 Determinism

Convex mutations must be deterministic under replay, so trigger *ordering* must
be too. Firing order = registration order within a table; the registry must be an
ordered structure, never object-key or `Set` iteration order over a
dynamically-built record. Worth stating in `server/database/determinism.mdx`
alongside the existing clock-stubbing note.

### 6.9 Observability

Every trigger invocation wraps in
`Effect.withSpan("confect.trigger", { attributes: { table, trigger, operation, depth } })`
and annotates logs with the same. Free, given that handlers are `Effect`s, and it
is the entire answer to "spooky action at a distance" — the span tree shows the
cascade. This alone is a strong argument for requiring names.

---

## 7. Costs and risks, stated plainly

**Bundle isolation.** `REVIEW.md` treats per-function bundle isolation as a
correctness invariant: a function's cold-start bundle should scale with its own
group, not the project. A central trigger registry is the opposite shape — it
transitively imports every trigger's dependencies, and the mutation layer needs
it. Mitigations, in order of preference:

1. **Emit triggers only into groups that contain mutations.** Codegen knows each
   group's function types from its spec, so `_generated/registeredFunctions/<group>.ts`
   can pass the trigger registry only when the group has at least one mutation.
   Every query bundle stays exactly as it is today. This is cheap and should be
   done regardless.
2. Per-table trigger modules (Proposal B) so the unit is a table, not the project.
3. Accept that mutation bundles carry the trigger graph, and document it.

What is *not* available: knowing statically which tables a given mutation writes.
So mutation bundles will grow. That is the price of unbypassable triggers, and it
should be measured before committing.

**Laziness.** `REVIEW.md`'s other invariant: constructing specs and tables must
not force schema thunks. Trigger registration must not read `table.Fields`,
`table.Doc`, or `tableDefinition` at module load. Handlers are already functions,
so this is free — but `whenChanged` (§6.5) needs field equivalences derived from
the table schema, and those must be built lazily on first fire, not at
registration.

**Bypass surfaces.** Triggers will not fire for: Convex dashboard edits,
`convex import`, component-internal tables, plain Convex functions registered via
`FunctionSpec.convex*`, or anything reaching `ctx.db` through the raw
`MutationCtx` service. The first three are inherent. The last two are worth
addressing: Confect constructs the `MutationCtx` service value it provides, so it
could hand out a `ctx` whose `db` is the *triggered* writer, closing the largest
in-Confect hole. Document the rest prominently — the `convex-helpers` article's
willingness to lead with its own caveats is a good model.

**Testing.** `TestConfect.run` builds its layer from
`RegisteredConvexFunction.mutationLayer`, so triggers apply automatically in
tests with no changes — good. Fixture seeding will want to bypass them, which
§6.4's `Trigger.untriggered` already covers.

---

## 8. Recommendation

Ship **Proposal A** with the shared vocabulary of §4:

- `Trigger` / `Triggers` modules in `@confect/server`, mirroring `CronJob` /
  `CronJobs`.
- A `confect/triggers.ts` well-known file, discovered by the CLI like
  `confect/crons.ts`, woven into `mutationLayer` — **unbypassable, zero wiring**.
- Tagged-union `Change` with decoded documents, no nullable fields, plus
  `onInsert` / `onUpdate` / `onDelete` sugar.
- **Required names** on every trigger.
- Recursion `"immediate"` with `maxDepth: 16`; `Trigger.untriggered` as the
  scoped escape hatch.
- `Effect<void, never, MutationServices<S>>` handlers; poison-pill failure
  semantics so a caught error can't commit partial state.
- Automatic spans and log annotations.
- Codegen passes the registry only to groups containing mutations.

Then, in rough priority order: `whenChanged` (§6.5), scheduled triggers (§6.6),
the public interceptor substrate (Proposal D), colocated per-table modules
(Proposal B), and — only if typed trigger errors (§6.3) are wanted — the spec/impl
split (Proposal C).

The through-line: **everything `convex-helpers` calls a caveat, Confect's
architecture can turn into a guarantee.** Opt-in wiring becomes automatic
wiring. Nullable change fields become a union. Untyped raw documents become
decoded ones. Anonymous callbacks become named, traced spans. "Spooky action at a
distance" becomes a span tree. That is the case for building this rather than
re-exporting the precedent.

---

## Open questions

1. Should `Update` distinguish `patch` from `replace` (`via`), or is that leaking
   an implementation detail of the writer?
2. Is `"immediate"` (DFS) or `"queued"` (BFS) the better default? The precedent
   deliberately chose BFS.
3. Should the `MutationCtx` service hand out a trigger-wrapped `ctx.db`? It closes
   a real hole but makes the "raw Convex context" service not actually raw.
4. Is a Payload-style per-mutation `context` scratchpad (a `FiberRef` bag) worth
   having as the sanctioned loop-breaker, given §6.4 already covers the common
   case?
5. Do triggers fire for writes made by *other* triggers in a different table by
   default, or should cross-table cascade require explicit opt-in?
6. How much do mutation bundles actually grow (§7)? This should be measured on
   `apps/example` before the design is locked.

---

## Sources

- [convex-helpers `server/triggers`](https://github.com/get-convex/convex-helpers) (read from `convex-helpers@0.1.120` source)
- [Database Triggers — Convex Stack](https://stack.convex.dev/triggers)
- [`@convex-dev/aggregate`](https://www.convex.dev/components/aggregate) (`TableAggregate.trigger()` read from `@convex-dev/aggregate@0.2.2` source)
- [Triggers — Convex + Better Auth](https://labs.convex.dev/better-auth/features/triggers)
- [Cascading deletes and soft deletion — convex-ents](https://labs.convex.dev/convex-ents/schema/deletes)
- [Triggers — Gel / EdgeDB](https://docs.geldata.com/reference/datamodel/triggers)
- [Collection Hooks — Payload CMS](https://payloadcms.com/docs/hooks/collections)
- [Prisma Client extensions: query component](https://www.prisma.io/docs/orm/prisma-client/client-extensions/query)
- [Prisma Client extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- PostgreSQL `CREATE TRIGGER`; SQLite `PRAGMA recursive_triggers`; TypeORM subscribers; Django signals; Rails ActiveRecord callbacks; Sequelize hooks; Firestore v2 triggers; Hasura event triggers
