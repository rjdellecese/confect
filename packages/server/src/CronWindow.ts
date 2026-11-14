import type { Crons } from "convex/server";
import * as Predicate from "effect/Predicate";

export const TypeId = "~@confect/server/CronWindow";
export type TypeId = typeof TypeId;

type DayOfWeek = Parameters<Crons["weekly"]>[1]["dayOfWeek"];

export type CronWindow = { readonly [TypeId]: TypeId } & (
  | { readonly type: "hourly" }
  | { readonly type: "daily"; readonly hourUtc: number }
  | {
      readonly type: "weekly";
      readonly dayOfWeek: DayOfWeek;
      readonly hourUtc: number;
    }
  | { readonly type: "monthly"; readonly day: number; readonly hourUtc: number }
);

export const isCronWindow = (u: unknown): u is CronWindow =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,
};

export const hourly = (): CronWindow =>
  Object.assign(Object.create(Proto), { type: "hourly" });

export const daily = (options: { readonly hourUtc: number }): CronWindow =>
  Object.assign(Object.create(Proto), {
    type: "daily",
    hourUtc: options.hourUtc,
  });

export const weekly = (options: {
  readonly dayOfWeek: DayOfWeek;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    type: "weekly",
    dayOfWeek: options.dayOfWeek,
    hourUtc: options.hourUtc,
  });

export const monthly = (options: {
  readonly day: number;
  readonly hourUtc: number;
}): CronWindow =>
  Object.assign(Object.create(Proto), {
    type: "monthly",
    day: options.day,
    hourUtc: options.hourUtc,
  });
