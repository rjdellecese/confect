import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { pipe } from "effect/Function";
import * as Scheduler from "effect/Scheduler";

/**
 * Convex bans `setTimeout` in queries and mutations and their isolate has no
 * `setImmediate` — and it evaluates a function's module graph inside that same
 * isolate, so Effects run at module scope (registration layer builds, schema →
 * validator compiles) face the same restrictions as handlers.
 *
 * `Effect.runSync` is unsafe there: it forks its fiber with its own
 * `MixedScheduler("sync")` (passed as a run option, so it overrides any
 * scheduler provided within the effect), and once a synchronous fiber exhausts
 * its op budget (`MaxOpsBeforeYield`, 2048 operations) the run loop injects a
 * cooperative yield whose dispatcher eagerly arms `setImmediate`/`setTimeout`
 * — crashing the isolate even though `runSync`'s trailing flush would have
 * drained the task. Registration work scales with app size, so large apps
 * cross the budget while small ones never do.
 *
 * These runners instead put `Scheduler.PreventSchedulerYield` in the fiber's
 * base context via `Effect.runSyncWith`: it sits in the root context (below
 * `runSync`'s scheduler run option, which it composes with rather than
 * fights), never pops, and makes the run loop skip yield checks entirely — the
 * correct semantic for a synchronous module-scope computation, which has
 * nothing to cooperatively yield to.
 */
const preventYieldContext = Context.make(Scheduler.PreventSchedulerYield, true);

export const runSyncInIsolate: <A, E>(effect: Effect.Effect<A, E>) => A =
  Effect.runSyncWith(preventYieldContext);

export const runSyncExitInIsolate: <A, E>(
  effect: Effect.Effect<A, E>,
) => Exit.Exit<A, E> = Effect.runSyncExitWith(preventYieldContext);

/** `runSyncExitInIsolate`, squashing failures into a thrown error. */
export const runSyncThrowInIsolate = <A, E>(effect: Effect.Effect<A, E>): A =>
  pipe(
    effect,
    runSyncExitInIsolate,
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => {
        throw Cause.squash(cause);
      },
    }),
  );
