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
 * Recurring invocation description created by {@link make}. Add it to a CronJobs
 * collection to encode arguments and validate the schedule.
 *
 * @category Models
 */
export interface CronJob {
  /**
   * @internal
   */
  readonly [TypeId]: TypeId;

  /**
   * Unique job identifier within the cron collection.
   *
   * @category Models
   */
  readonly identifier: string;
  /**
   * UTC cron expression, fixed interval or recurring hour window.
   *
   * @category Models
   */
  readonly schedule: Cron.Cron | Duration.Duration | CronWindow.CronWindow;
  /**
   * Mutation or action to invoke; prefer an internal ref for scheduled work.
   *
   * @category Models
   */
  readonly ref: Ref.AnyMutation | Ref.AnyAction;
  /**
   * Decoded invocation arguments, encoded when added to the collection.
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
 * Describe a recurring mutation or action without registering it yet.
 *
 * @category Constructors
 *
 * @param identifier - Unique name within the CronJobs collection.
 * @param schedule - UTC Cron, positive whole-unit Duration or CronWindow.
 * @param ref - Generated mutation/action ref; internal refs are recommended.
 * @param args - Decoded arguments, optional for an argument-free ref.
 *
 * @returns A job description. CronJobs.add performs argument encoding and
 *   schedule validation, not this constructor.
 */
export const make = <R extends Ref.AnyMutation | Ref.AnyAction>(
  identifier: string,
  schedule: Cron.Cron | Duration.Duration | CronWindow.CronWindow,
  ref: R,
  ...args: Ref.OptionalArgs<R>
): CronJob => makeProto(identifier, schedule, ref, args[0] ?? {});
