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
   * Cancels a scheduled invocation by its scheduled-function ID. Cancellation
   * does not undo work that has already run.
   *
   * @category Scheduling
   *
   * @param id - ID in `_scheduled_functions` returned by `runAfter` or `runAt`.
   *
   * @returns An Effect that completes without a value. A Convex rejection is a
   *   defect.
   */
  cancel: (id: GenericId<"_scheduled_functions">) =>
    Effect.promise(() => scheduler.cancel(id)),
  /**
   * Schedules a mutation or action to run after the given delay.
   *
   * @category Scheduling
   *
   * @param delay - Effect duration, converted to milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the scheduled-function ID. A Convex rejection
   *   is a defect.
   *
   * @throws If the arguments cannot be encoded, before the Effect is returned.
   */
  runAfter: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ) => {
    const delayMs = Duration.toMillis(delay);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(ref, Ref.argsOrEmpty<Ref_>(args));

    return Effect.promise(() =>
      scheduler.runAfter(delayMs, functionReference, encodedArgs),
    );
  },
  /**
   * Schedules a mutation or action to run at the given instant.
   *
   * @category Scheduling
   *
   * @param dateTime - Effect date and time, converted to epoch milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the scheduled-function ID. A Convex rejection
   *   is a defect.
   *
   * @throws If the arguments cannot be encoded, before the Effect is returned.
   */
  runAt: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(ref, Ref.argsOrEmpty<Ref_>(args));

    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, encodedArgs),
    );
  },
});

/**
 * Tag for scheduling mutations and actions or canceling a scheduled invocation.
 * Yield the generated `Scheduler` tag in a mutation, action, or HTTP handler.
 *
 * @category Tags
 */
export const Scheduler =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/Scheduler");
/**
 * Effect environment requirement for an operation that schedules or cancels a
 * function through the generated `Scheduler` service.
 *
 * @category Context
 */
export type Scheduler = typeof Scheduler.Identifier;

/**
 * @internal
 */
export const layer = (scheduler: ConvexScheduler) =>
  Layer.succeed(Scheduler, make(scheduler));
