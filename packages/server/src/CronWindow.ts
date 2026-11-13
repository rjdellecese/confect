import type { Types } from "@confect/core";
import type { CronJob as ConvexCronJob } from "convex/server";
import * as Predicate from "effect/Predicate";

export const TypeId = "~@confect/server/CronWindow";
export type TypeId = typeof TypeId;

type WindowFields<S> = {
  readonly [
    K in keyof S as K extends "minuteUTC"
      ? never
      : K extends "hourUTC"
        ? "hourUtc"
        : K
  ]: S[K];
};

type Window = WindowFields<
  Extract<
    ConvexCronJob["schedule"],
    { type: "hourly" | "daily" | "weekly" | "monthly" }
  >
>;

export type CronWindow = Window & { readonly [TypeId]: TypeId };

export const isCronWindow = (u: unknown): u is CronWindow =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = (window: Window): CronWindow =>
  Object.assign(Object.create(Proto), window);

export const hourly = (): CronWindow => makeProto({ type: "hourly" });

export const daily = (
  options: Types.OmitKey<Extract<Window, { type: "daily" }>, "type">,
): CronWindow => makeProto({ type: "daily", hourUtc: options.hourUtc });

export const weekly = (
  options: Types.OmitKey<Extract<Window, { type: "weekly" }>, "type">,
): CronWindow =>
  makeProto({
    type: "weekly",
    dayOfWeek: options.dayOfWeek,
    hourUtc: options.hourUtc,
  });

export const monthly = (
  options: Types.OmitKey<Extract<Window, { type: "monthly" }>, "type">,
): CronWindow =>
  makeProto({ type: "monthly", day: options.day, hourUtc: options.hourUtc });
