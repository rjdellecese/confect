import { fromPrototype } from "./internal/fromPrototype";
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
 * Recurring UTC window that lets Convex choose the execution minute within an
 * hour.
 *
 * **When to use**
 *
 * Use to spread recurring work across the hour, such as sending daily reminders
 * that do not need to go out at an exact minute.
 *
 * **Details**
 *
 * The `_tag` identifies the cadence. Daily, weekly, and monthly windows carry
 * `hourUtc`; weekly windows also carry `dayOfWeek`, and monthly windows carry
 * `day`. Convex validates the calendar fields when you add the job to the
 * collection.
 *
 * @category Models
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
} satisfies Pick<CronWindow, TypeId>;

/**
 * Creates a window that recurs every hour at a minute chosen by Convex.
 *
 * @category Constructors
 *
 * @returns An hourly window to pass to `CronJob.make`.
 */
export const hourly = (): CronWindow =>
  Object.assign(fromPrototype(Proto), { _tag: "Hourly" as const });

/**
 * Creates a window that recurs during the specified UTC hour each day.
 *
 * **Example** (Running a daily job between 17:00 and 18:00 UTC)
 *
 * ```ts
 * import * as CronWindow from "@confect/server/CronWindow";
 *
 * CronWindow.daily({ hourUtc: 17 });
 * ```
 *
 * @category Constructors
 *
 * @param options - UTC hour as an integer from 0 through 23. Convex checks it
 *   when you add the job to a collection.
 *
 * @returns A daily window whose minute is chosen by Convex.
 */
export const daily = (options: { readonly hourUtc: number }): CronWindow =>
  Object.assign(fromPrototype(Proto), {
    _tag: "Daily" as const,
    hourUtc: options.hourUtc,
  });

/**
 * Creates a window that recurs during a UTC hour on the selected weekday.
 *
 * **Example** (Scheduling a job for Monday mornings in UTC)
 *
 * ```ts
 * import * as CronWindow from "@confect/server/CronWindow";
 *
 * CronWindow.weekly({ dayOfWeek: "monday", hourUtc: 9 });
 * ```
 *
 * @category Constructors
 *
 * @param options - Lowercase weekday such as `"monday"` and UTC hour as an
 *   integer from 0 through 23. Convex checks these fields when you add the job
 *   to a collection.
 *
 * @returns A weekly window whose minute is chosen by Convex.
 */
export const weekly = (options: {
  readonly dayOfWeek: DayOfWeek;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(fromPrototype(Proto), {
    _tag: "Weekly" as const,
    dayOfWeek: options.dayOfWeek,
    hourUtc: options.hourUtc,
  });

/**
 * Creates a window that recurs during a UTC hour on the selected day of the
 * month.
 *
 * **Gotchas**
 *
 * Convex skips months that do not contain the selected day, so a job scheduled
 * for the 30th does not run in February.
 *
 * **Example** (Scheduling a job for the first day of each month)
 *
 * ```ts
 * import * as CronWindow from "@confect/server/CronWindow";
 *
 * CronWindow.monthly({ day: 1, hourUtc: 9 });
 * ```
 *
 * @category Constructors
 *
 * @param options - Day of the month as an integer from 1 through 31 and UTC
 *   hour as an integer from 0 through 23. Convex checks these fields when you
 *   add the job to a collection.
 *
 * @returns A monthly window whose minute is chosen by Convex.
 */
export const monthly = (options: {
  readonly day: number;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(fromPrototype(Proto), {
    _tag: "Monthly" as const,
    day: options.day,
    hourUtc: options.hourUtc,
  });
