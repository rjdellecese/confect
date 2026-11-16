import type { Crons } from "convex/server";
import * as Predicate from "effect/Predicate";

/**
 * @internal
 */
export const TypeId = "~@confect/server/CronWindow";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

type DayOfWeek = Parameters<Crons["weekly"]>[1]["dayOfWeek"];

/**
 * Recurring UTC hour in which Convex chooses the execution minute. Create one
 * with hourly/daily/weekly/monthly; `_tag` identifies the cadence. Daily and
 * longer windows carry hourUtc, weekly also dayOfWeek, and monthly also day.
 * Calendar fields are validated when the job is added to CronJobs.
 */
export type CronWindow = { readonly [TypeId]: TypeId } & (
  | { readonly _tag: "Hourly" }
  | { readonly _tag: "Daily"; readonly hourUtc: number }
  | {
      readonly _tag: "Weekly";
      readonly dayOfWeek: DayOfWeek;
      readonly hourUtc: number;
    }
  | { readonly _tag: "Monthly"; readonly day: number; readonly hourUtc: number }
);

/**
 * @internal
 */
export const isCronWindow = (u: unknown): u is CronWindow =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,
};

/**
 * Schedule within every hour, at a minute chosen by Convex.
 *
 * @returns A window to pass to CronJob.make; no exact minute is promised.
 */
export const hourly = (): CronWindow =>
  Object.assign(Object.create(Proto), { _tag: "Hourly" });

/**
 * Schedule within the same UTC hour each day.
 *
 * @example
 *   daily({ hourUtc: 17 });
 *
 * @param options - HourUtc from 0 through 23; validation occurs in
 *   CronJobs.add.
 *
 * @returns A daily window whose minute is selected by Convex.
 */
export const daily = (options: { readonly hourUtc: number }): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Daily",
    hourUtc: options.hourUtc,
  });

/**
 * Schedule within a UTC hour on one weekday.
 *
 * @example
 *   weekly({ dayOfWeek: "monday", hourUtc: 9 });
 *
 * @param options - Lowercase dayOfWeek (for example "monday") and hourUtc 0–23.
 *
 * @returns A weekly window; CronJobs.add validates the calendar fields.
 */
export const weekly = (options: {
  readonly dayOfWeek: DayOfWeek;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Weekly",
    dayOfWeek: options.dayOfWeek,
    hourUtc: options.hourUtc,
  });

/**
 * Schedule within a UTC hour on one day of the month.
 *
 * @example
 *   monthly({ day: 1, hourUtc: 9 });
 *
 * @param options - Day from 1 through 31 and hourUtc from 0 through 23.
 *
 * @returns A monthly window; Convex owns missing-day and minute-selection
 *   semantics, and CronJobs.add validates the calendar fields.
 */
export const monthly = (options: {
  readonly day: number;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Monthly",
    day: options.day,
    hourUtc: options.hourUtc,
  });
