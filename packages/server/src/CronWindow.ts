import type { Crons } from "convex/server";
import * as Predicate from "effect/Predicate";

export const TypeId = "~@confect/server/CronWindow";
export type TypeId = typeof TypeId;

type DayOfWeek = Parameters<Crons["weekly"]>[1]["dayOfWeek"];

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

export const isCronWindow = (u: unknown): u is CronWindow =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,
};

export const hourly = (): CronWindow =>
  Object.assign(Object.create(Proto), { _tag: "Hourly" });

export const daily = (options: { readonly hourUtc: number }): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Daily",
    hourUtc: options.hourUtc,
  });

export const weekly = (options: {
  readonly dayOfWeek: DayOfWeek;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Weekly",
    dayOfWeek: options.dayOfWeek,
    hourUtc: options.hourUtc,
  });

export const monthly = (options: {
  readonly day: number;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    _tag: "Monthly",
    day: options.day,
    hourUtc: options.hourUtc,
  });
