import { FunctionSpec, Ref } from "@confect/core";
import { Cron, Duration, Schema } from "effect";
import { describe, expect, test } from "vitest";
import * as CronJob from "../src/CronJob";
import * as CronJobs from "../src/CronJobs";

const makeMutationRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      args: Schema.Struct({}),
      returns: Schema.Void,
    }),
  );

const makeActionRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalAction({
      name,
      args: Schema.Struct({}),
      returns: Schema.Void,
    }),
  );

const makeMutationRefWithArgs = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      args: Schema.Struct({ email: Schema.String }),
      returns: Schema.Void,
    }),
  );

describe("cronToConvexCronString", () => {
  test("daily at 4:00 UTC", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [4],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 4 * * *");
  });

  test("every minute", () => {
    const cron = Cron.make({
      minutes: [],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("* * * * *");
  });

  test("every 15 minutes roundtrips", () => {
    const cron = Cron.unsafeParse("*/15 * * * *");
    expect(CronJobs.cronToConvexCronString(cron)).toBe("0,15,30,45 * * * *");
  });

  test("specific weekdays", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [1, 3, 5],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 9 * * 1,3,5");
  });

  test("complex multi-field schedule", () => {
    const cron = Cron.make({
      minutes: [0, 30],
      hours: [8, 12, 18],
      days: [1, 15],
      months: [1, 6],
      weekdays: [],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe(
      "0,30 8,12,18 1,15 1,6 *",
    );
  });

  test("sorts unsorted set values", () => {
    const cron = Cron.make({
      minutes: [45, 15, 30, 0],
      hours: [18, 6, 12],
      days: [],
      months: [],
      weekdays: [5, 1, 3],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe(
      "0,15,30,45 6,12,18 * * 1,3,5",
    );
  });

  test("throws on non-default seconds (single non-zero)", () => {
    const cron = Cron.make({
      seconds: [30],
      minutes: [0],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(() => CronJobs.cronToConvexCronString(cron)).toThrow(
      "seconds field",
    );
  });

  test("throws on non-default seconds (multiple values)", () => {
    const cron = Cron.make({
      seconds: [0, 30],
      minutes: [0],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(() => CronJobs.cronToConvexCronString(cron)).toThrow(
      "seconds field",
    );
  });

  test("does not throw when seconds is the default {0}", () => {
    const cron = Cron.make({
      seconds: [0],
      minutes: [0],
      hours: [12],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(() => CronJobs.cronToConvexCronString(cron)).not.toThrow();
  });
});

describe("durationToConvexIntervalSchedule", () => {
  test("converts seconds to interval seconds", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.seconds(30)),
    ).toEqual({
      type: "interval",
      seconds: 30,
    });
  });

  test("converts minutes to interval minutes", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.minutes(5)),
    ).toEqual({
      type: "interval",
      minutes: 5,
    });
  });

  test("converts hours to interval hours", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.hours(2)),
    ).toEqual({
      type: "interval",
      hours: 2,
    });
  });

  test("prefers hours when evenly divisible", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.seconds(3600)),
    ).toEqual({
      type: "interval",
      hours: 1,
    });
  });

  test("prefers minutes over seconds when evenly divisible", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.seconds(120)),
    ).toEqual({
      type: "interval",
      minutes: 2,
    });
  });

  test("falls back to seconds when not divisible by minutes", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.seconds(45)),
    ).toEqual({
      type: "interval",
      seconds: 45,
    });
  });

  test("handles large hour values", () => {
    expect(
      CronJobs.durationToConvexIntervalSchedule(Duration.hours(720)),
    ).toEqual({
      type: "interval",
      hours: 720,
    });
  });

  test("throws on zero duration", () => {
    expect(() =>
      CronJobs.durationToConvexIntervalSchedule(Duration.seconds(0)),
    ).toThrow("positive duration");
  });

  test("throws on sub-second duration", () => {
    expect(() =>
      CronJobs.durationToConvexIntervalSchedule(Duration.millis(500)),
    ).toThrow("whole number of seconds, minutes, or hours");
  });
});

describe("CronJobs.make", () => {
  test("produces an empty CronJobs", () => {
    const jobs = CronJobs.make();

    expect(CronJobs.isCronJobs(jobs)).toBe(true);
    expect(jobs.cronJobs).toEqual({});
    expect(jobs.convexCronJobs.crons).toEqual({});
  });
});

describe("CronJobs.add", () => {
  test("adds a cron job and populates convexCronJobs", () => {
    const ref = makeMutationRef("sessions", "clearStale");
    const cron = Cron.make({
      minutes: [0],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });
    const cronJob = CronJob.make("clear sessions", cron, ref);

    const result = CronJobs.make().add(cronJob);

    expect(CronJob.isCronJob(result.cronJobs["clear sessions"]!)).toBe(true);
    expect(result.convexCronJobs.crons["clear sessions"]).toEqual({
      name: "sessions:clearStale",
      args: [{}],
      schedule: { type: "cron", cron: "0 * * * *" },
    });
  });

  test("chains multiple add calls", () => {
    const ref1 = makeMutationRef("sessions", "clearStale");
    const ref2 = makeActionRef("emails", "sendDigest");

    const result = CronJobs.make()
      .add(
        CronJob.make(
          "clear sessions",
          Cron.make({
            minutes: [0],
            hours: [],
            days: [],
            months: [],
            weekdays: [],
          }),
          ref1,
        ),
      )
      .add(
        CronJob.make(
          "send digest",
          Cron.make({
            minutes: [0],
            hours: [9],
            days: [],
            months: [],
            weekdays: [1],
          }),
          ref2,
        ),
      );

    expect(Object.keys(result.cronJobs)).toEqual([
      "clear sessions",
      "send digest",
    ]);
    expect(Object.keys(result.convexCronJobs.crons)).toEqual([
      "clear sessions",
      "send digest",
    ]);
    expect(result.convexCronJobs.crons["send digest"]).toEqual({
      name: "emails:sendDigest",
      args: [{}],
      schedule: { type: "cron", cron: "0 9 * * 1" },
    });
  });

  test("does not mutate previous CronJobs instance", () => {
    const ref = makeMutationRef("sessions", "clearStale");
    const cron = Cron.make({
      minutes: [0],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    const empty = CronJobs.make();
    const withJob = empty.add(CronJob.make("clear sessions", cron, ref));

    expect(Object.keys(empty.cronJobs)).toEqual([]);
    expect(Object.keys(empty.convexCronJobs.crons)).toEqual([]);
    expect(Object.keys(withJob.cronJobs)).toEqual(["clear sessions"]);
    expect(Object.keys(withJob.convexCronJobs.crons)).toEqual([
      "clear sessions",
    ]);
  });

  test("adds an interval job and populates convexCronJobs", () => {
    const ref = makeMutationRef("health", "ping");
    const schedule = Duration.seconds(30);
    const cronJob = CronJob.make("ping", schedule, ref);

    const result = CronJobs.make().add(cronJob);

    expect(CronJob.isCronJob(result.cronJobs["ping"]!)).toBe(true);
    expect(result.convexCronJobs.crons["ping"]).toEqual({
      name: "health:ping",
      args: [{}],
      schedule: { type: "interval", seconds: 30 },
    });
  });

  test("mixes cron and interval jobs", () => {
    const ref1 = makeMutationRef("sessions", "clearStale");
    const ref2 = makeMutationRef("health", "ping");

    const result = CronJobs.make()
      .add(
        CronJob.make(
          "clear sessions",
          Cron.make({
            minutes: [0],
            hours: [],
            days: [],
            months: [],
            weekdays: [],
          }),
          ref1,
        ),
      )
      .add(CronJob.make("ping", Duration.seconds(30), ref2));

    expect(result.convexCronJobs.crons["clear sessions"]!.schedule).toEqual({
      type: "cron",
      cron: "0 * * * *",
    });
    expect(result.convexCronJobs.crons["ping"]!.schedule).toEqual({
      type: "interval",
      seconds: 30,
    });
  });

  test("convexCronJobs.export() serializes all jobs", () => {
    const ref = makeMutationRef("sessions", "clearStale");
    const cron = Cron.make({
      minutes: [0],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    const result = CronJobs.make().add(
      CronJob.make("clear sessions", cron, ref),
    );
    const parsed = JSON.parse(JSON.stringify(result.convexCronJobs.crons));

    expect(parsed).toEqual({
      "clear sessions": {
        name: "sessions:clearStale",
        args: [{}],
        schedule: { type: "cron", cron: "0 * * * *" },
      },
    });
  });

  test("passes encoded args to convexCronJobs for a cron schedule", () => {
    const ref = makeMutationRefWithArgs("payments", "sendEmail");
    const cronJob = CronJob.make(
      "payment reminder",
      Cron.unsafeParse("0 16 1 * *"),
      ref,
      { email: "billing@example.com" },
    );

    const result = CronJobs.make().add(cronJob);

    expect(result.convexCronJobs.crons["payment reminder"]).toEqual({
      name: "payments:sendEmail",
      args: [{ email: "billing@example.com" }],
      schedule: { type: "cron", cron: "0 16 1 * *" },
    });
  });

  test("passes encoded args to convexCronJobs for an interval schedule", () => {
    const ref = makeMutationRefWithArgs("notifications", "send");
    const cronJob = CronJob.make("send notification", Duration.hours(1), ref, {
      email: "user@example.com",
    });

    const result = CronJobs.make().add(cronJob);

    expect(result.convexCronJobs.crons["send notification"]).toEqual({
      name: "notifications:send",
      args: [{ email: "user@example.com" }],
      schedule: { type: "interval", hours: 1 },
    });
  });
});
