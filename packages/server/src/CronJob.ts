import type { Ref } from "@confect/core";
import type { Cron, Duration } from "effect";
import * as Predicate from "effect/Predicate";
import type * as CronWindow from "./CronWindow";

/**
 * @internal
 */
export const TypeId = "~@confect/server/CronJob";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * Description of a recurring mutation or action, created by {@link make}. Add it
 * to a `CronJobs` collection to register the schedule and arguments together.
 *
 * @category Models
 */
export interface CronJob {
  /**
   * @internal
   */
  readonly [TypeId]: TypeId;

  /**
   * Name that identifies this job within its cron collection.
   *
   * @category Models
   */
  readonly identifier: string;
  /**
   * UTC cron expression, fixed interval, or recurring window in which Convex
   * chooses the minute.
   *
   * @category Models
   */
  readonly schedule: Cron.Cron | Duration.Duration | CronWindow.CronWindow;
  /**
   * Reference to the mutation or action to invoke. Use an internal reference
   * when the function should not be callable by clients.
   *
   * @category Models
   */
  readonly ref: Ref.AnyMutation | Ref.AnyAction;
  /**
   * Arguments in the function's decoded form. Adding the job to a collection
   * encodes them for Convex.
   *
   * @category Models
   */
  readonly args: Record<string, unknown>;
}

/**
 * @internal
 */
export const isCronJob = (u: unknown): u is CronJob =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = (
  identifier: string,
  schedule: Cron.Cron | Duration.Duration | CronWindow.CronWindow,
  ref: Ref.AnyMutation | Ref.AnyAction,
  args: Record<string, unknown>,
): CronJob =>
  Object.assign(Object.create(Proto), {
    identifier,
    schedule,
    ref,
    args,
  });

/**
 * Creates a description of a recurring mutation or action without registering
 * it or evaluating its argument schema.
 *
 * **Details**
 *
 * `CronJobs.add` encodes Confect function arguments and checks the schedule
 * when you add the description to a collection.
 *
 * @category Constructors
 *
 * @param identifier - Unique name within the cron collection.
 * @param schedule - UTC cron expression, positive interval in whole seconds, or
 *   recurring UTC hour window.
 * @param ref - Generated reference to a mutation or action; use an internal
 *   reference for jobs that need no public endpoint.
 * @param args - Decoded arguments. Omit this argument only for a reference with
 *   no argument keys.
 *
 * @returns A job description ready to add to a cron collection.
 */
export const make = <R extends Ref.AnyMutation | Ref.AnyAction>(
  identifier: string,
  schedule: Cron.Cron | Duration.Duration | CronWindow.CronWindow,
  ref: R,
  ...args: Ref.OptionalArgs<R>
): CronJob => makeProto(identifier, schedule, ref, args[0] ?? {});
