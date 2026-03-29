import { Ref } from "@confect/core";
import type {
  CronJob as ConvexCronJob,
  SchedulableFunctionReference,
} from "convex/server";
import { cronJobs as makeConvexCrons, type Crons } from "convex/server";
import {
  Array,
  Cron,
  Duration,
  Match,
  Order,
  pipe,
  Predicate,
  Record,
  Schema,
} from "effect";
import type * as CronJob from "./CronJob";

export const TypeId = "@confect/server/CronJobs";
export type TypeId = typeof TypeId;

export interface CronJobs {
  readonly [TypeId]: TypeId;
  readonly cronJobs: Record<string, CronJob.CronJob>;
  readonly convexCronJobs: Crons;

  add(cron: CronJob.CronJob): CronJobs;
}

export const isCronJobs = (u: unknown): u is CronJobs =>
  Predicate.hasProperty(u, TypeId);

const Proto = {
  [TypeId]: TypeId,

  add(this: CronJobs, cronJob: CronJob.CronJob) {
    const newConvexCrons = Object.assign(makeConvexCrons(), {
      crons: { ...this.convexCronJobs.crons },
    });

    const schedulableFunctionReference = Ref.getConvexFunctionName(
      cronJob.ref,
    ) as unknown as SchedulableFunctionReference;

    const functionSpec = Ref.getFunctionSpec(cronJob.ref);
    const encodedArgs = Match.value(functionSpec.functionProvenance).pipe(
      Match.tag("Confect", (confect) =>
        Schema.encodeSync(confect.args)(cronJob.args),
      ),
      Match.tag("Convex", () => cronJob.args),
      Match.exhaustive,
    );

    Match.value(cronJob.schedule).pipe(
      Match.when(Cron.isCron, (cron) => {
        newConvexCrons.cron(
          cronJob.identifier,
          cronToConvexCronString(cron),
          schedulableFunctionReference,
          encodedArgs,
        );
      }),
      Match.when(Duration.isDuration, (duration) => {
        newConvexCrons.interval(
          cronJob.identifier,
          durationToConvexIntervalSchedule(duration),
          schedulableFunctionReference,
          encodedArgs,
        );
      }),
      Match.exhaustive,
    );

    return makeProto(
      Record.set(this.cronJobs, cronJob.identifier, cronJob),
      newConvexCrons,
    );
  },
};

const makeProto = (
  cronJobs: Record<string, CronJob.CronJob>,
  convexCronJobs: Crons,
): CronJobs =>
  Object.assign(Object.create(Proto), {
    cronJobs,
    convexCronJobs,
  });

export const make = (): CronJobs => makeProto({}, makeConvexCrons());

/** @internal */
export const cronToConvexCronString = (cron: Cron.Cron): string => {
  const hasNonDefaultSeconds = cron.seconds.size !== 1 || !cron.seconds.has(0);
  if (hasNonDefaultSeconds) {
    throw new Error(
      "Convex cron expressions do not support a seconds field. " +
        "The seconds field must be the default {0}. " +
        "Sub-minute scheduling is supported only by interval schedules defined using a Duration.",
    );
  }

  return Array.join(
    [
      setToField(cron.minutes),
      setToField(cron.hours),
      setToField(cron.days),
      setToField(cron.months),
      setToField(cron.weekdays),
    ],
    " ",
  );
};

const setToField = (set: ReadonlySet<number>): string => {
  if (set.size === 0) return "*";
  return pipe(
    set,
    Array.sort(Order.number),
    Array.map((n) => n.toString()),
    Array.join(","),
  );
};

/** @internal */
export const durationToConvexIntervalSchedule = (
  duration: Duration.Duration,
): IntervalSchedule => {
  const millis = Duration.toMillis(duration);
  if (millis <= 0) {
    throw new Error("Interval must be a positive duration.");
  }

  const oneHourInMillis = Duration.hours(1).pipe(Duration.toMillis);
  const hours = millis / oneHourInMillis;
  if (Number.isInteger(hours)) {
    return { type: "interval", hours };
  }

  const oneMinuteInMillis = Duration.minutes(1).pipe(Duration.toMillis);
  const minutes = millis / oneMinuteInMillis;
  if (Number.isInteger(minutes)) {
    return { type: "interval", minutes };
  }

  const oneSecondInMillis = Duration.seconds(1).pipe(Duration.toMillis);
  const seconds = millis / oneSecondInMillis;
  if (Number.isInteger(seconds)) {
    return { type: "interval", seconds };
  }

  throw new Error(
    "Interval must be a whole number of seconds, minutes, or hours.",
  );
};

type IntervalSchedule = Extract<
  ConvexCronJob["schedule"],
  { type: "interval" }
>;
