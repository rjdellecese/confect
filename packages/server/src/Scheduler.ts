import { Ref } from "@confect/core";
import type { Scheduler as ConvexScheduler } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const make = (scheduler: ConvexScheduler) => ({
  /**
   * Cancel a scheduled invocation.
   *
   * @param id - ID in `_scheduled_functions` returned by runAfter/runAt.
   *
   * @returns An Effect producing void. Native rejection is a defect;
   *   cancellation does not undo work that already ran.
   */
  cancel: (id: GenericId<"_scheduled_functions">) =>
    Effect.promise(() => scheduler.cancel(id)),
  /**
   * Schedule a mutation or action after a delay.
   *
   * @param delay - Effect Duration, converted to milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments, optional for an argument-free ref.
   *
   * @returns An Effect producing a scheduled-function ID; native rejection is a
   *   defect.
   *
   * @throws If arguments cannot be encoded, before the Effect is returned.
   */
  runAfter: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ) => {
    const delayMs = Duration.toMillis(delay);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Ref_>,
    );

    return Effect.promise(() =>
      scheduler.runAfter(delayMs, functionReference, encodedArgs),
    );
  },
  /**
   * Schedule a mutation or action at an absolute time.
   *
   * @param dateTime - Effect DateTime, converted to epoch milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments, optional for an argument-free ref.
   *
   * @returns An Effect producing a scheduled-function ID; native rejection is a
   *   defect.
   *
   * @throws If arguments cannot be encoded, before the Effect is returned.
   */
  runAt: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Ref_>,
    );

    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, encodedArgs),
    );
  },
});

/**
 * Scheduling service supplied in mutations, actions and HTTP handlers. Import
 * the generated `Scheduler` tag to obtain runAfter, runAt and cancel.
 */
export const Scheduler =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/Scheduler");
/**
 * Effect requirement identifier for the generated scheduling service.
 */
export type Scheduler = typeof Scheduler.Identifier;

/**
 * @internal
 */
export const layer = (scheduler: ConvexScheduler) =>
  Layer.succeed(Scheduler, make(scheduler));
