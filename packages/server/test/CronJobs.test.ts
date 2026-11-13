import * as Result from "effect/Result";
import * as RecordEffect from "effect/Record";
import { FunctionSpec, Ref } from "@confect/core";
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
import { assert, describe, expect, test } from "@effect/vitest";
import * as CronJob from "@confect/server/CronJob";
import * as CronJobs from "@confect/server/CronJobs";
import * as CronWindow from "@confect/server/CronWindow";

const makeMutationRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      returns: () => Schema.Void,
    }),
  );

const makeActionRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalAction({
      name,
      returns: () => Schema.Void,
    }),
  );

const makeMutationRefWithArgs = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      args: () => ({ email: Schema.String }),
      returns: () => Schema.Void,
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
    const cron = Cron.parseUnsafe("*/15 * * * *");
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

    expect(() =>
      CronJobs.cronToConvexCronString(cron),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Convex cron expressions do not support a seconds field. The seconds field must be the default {0}. Sub-minute scheduling is supported only by interval schedules defined using a Duration.]`,
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

    expect(() =>
      CronJobs.cronToConvexCronString(cron),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Convex cron expressions do not support a seconds field. The seconds field must be the default {0}. Sub-minute scheduling is supported only by interval schedules defined using a Duration.]`,
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

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 12 * * *");
  });

  test("accepts an explicit UTC offset time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneMakeOffset(0),
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 9 * * *");
  });

  test("accepts a named UTC time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneMakeNamedUnsafe("UTC"),
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 9 * * *");
  });

  test("accepts a named Etc/UTC time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneMakeNamedUnsafe("Etc/UTC"),
    });

    expect(CronJobs.cronToConvexCronString(cron)).toBe("0 9 * * *");
  });

  test("throws on a non-UTC named time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneMakeNamedUnsafe("America/New_York"),
    });

    expect(() =>
      CronJobs.cronToConvexCronString(cron),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Convex cron expressions are always evaluated in UTC, but this cron specifies the time zone "America/New_York". Either omit the timezone or specify UTC.]`,
    );
  });

  test("throws on a non-zero offset time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000),
    });

    expect(() =>
      CronJobs.cronToConvexCronString(cron),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Convex cron expressions are always evaluated in UTC, but this cron specifies the time zone "+03:00". Either omit the timezone or specify UTC.]`,
    );
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
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Interval must be a positive duration.]`,
    );
  });

  test("throws on sub-second duration", () => {
    expect(() =>
      CronJobs.durationToConvexIntervalSchedule(Duration.millis(500)),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Interval must be a whole number of seconds, minutes, or hours.]`,
    );
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
  test("exports all four windows without minute keys alongside explicit schedules", () => {
    const builds = { args: 0, returns: 0, error: 0 };
    const ref = Ref.make(
      "tasks/nested",
      FunctionSpec.internalAction({
        name: "count",
        args: () => {
          builds.args++;
          return { count: Schema.FiniteFromString };
        },
        returns: () => {
          builds.returns++;
          return Schema.Void;
        },
        error: () => {
          builds.error++;
          return Schema.String;
        },
      }),
    );
    const args = { count: 42 };
    const options = { dayOfWeek: "monday", hourUtc: 9 } as const;
    const weekly = CronWindow.weekly(options);
    const empty = CronJobs.make();
    const hourly = empty.add(
      CronJob.make("hourly", CronWindow.hourly(), ref, args),
    );
    const jobs = hourly
      .add(CronJob.make("daily", CronWindow.daily({ hourUtc: 17 }), ref, args))
      .add(CronJob.make("weekly", weekly, ref, args))
      .add(
        CronJob.make(
          "monthly",
          CronWindow.monthly({ day: 1, hourUtc: 0 }),
          ref,
          args,
        ),
      )
      .add(CronJob.make("explicit", Cron.parseUnsafe("23 17 * * *"), ref, args))
      .add(CronJob.make("interval", Duration.hours(1), ref, args));
    const expectedSchedules = {
      hourly: { type: "hourly" },
      daily: { type: "daily", hourUTC: 17 },
      weekly: { type: "weekly", dayOfWeek: "monday", hourUTC: 9 },
      monthly: { type: "monthly", day: 1, hourUTC: 0 },
      explicit: { type: "cron", cron: "23 17 * * *" },
      interval: { type: "interval", hours: 1 },
    };
    for (const [identifier, schedule] of RecordEffect.toEntries(
      expectedSchedules,
    )) {
      const exported = jobs.convexCronJobs.crons[identifier]!;
      expect(exported).toEqual({
        name: "tasks/nested:count",
        args: [{ count: "42" }],
        schedule,
      });
      expect(exported.schedule).not.toHaveProperty("minuteUTC");
      expect(exported.schedule).not.toHaveProperty("hourUtc");
    }
    assert(Predicate.hasProperty(jobs.convexCronJobs, "export"));
    assert(Predicate.isFunction(jobs.convexCronJobs.export));
    expect(
      Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))(
        jobs.convexCronJobs.export(),
      ).pipe(Result.getOrThrow),
    ).toEqual(jobs.convexCronJobs.crons);
    expect(builds).toEqual({ args: 1, returns: 0, error: 0 });
    expect(empty.cronJobs).toEqual({});
    expect(empty.convexCronJobs.crons).toEqual({});
    expect(RecordEffect.keys(hourly.cronJobs)).toEqual(["hourly"]);
    expect(RecordEffect.keys(hourly.convexCronJobs.crons)).toEqual(["hourly"]);
    expect(jobs.cronJobs.weekly!.schedule).toBe(weekly);
    expect(weekly).toEqual({ type: "weekly", dayOfWeek: "monday", hourUtc: 9 });
    expect(options).toEqual({ dayOfWeek: "monday", hourUtc: 9 });
    expect(args).toEqual({ count: 42 });
  });

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

    expect(RecordEffect.keys(result.cronJobs)).toEqual([
      "clear sessions",
      "send digest",
    ]);
    expect(RecordEffect.keys(result.convexCronJobs.crons)).toEqual([
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

    expect(RecordEffect.keys(empty.cronJobs)).toEqual([]);
    expect(RecordEffect.keys(empty.convexCronJobs.crons)).toEqual([]);
    expect(RecordEffect.keys(withJob.cronJobs)).toEqual(["clear sessions"]);
    expect(RecordEffect.keys(withJob.convexCronJobs.crons)).toEqual([
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
    const parsed = Schema.decodeResult(Schema.fromJsonString(Schema.Unknown))(
      Schema.encodeResult(Schema.fromJsonString(Schema.Unknown))(
        result.convexCronJobs.crons,
      ).pipe(Result.getOrThrow),
    ).pipe(Result.getOrThrow);

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
      Cron.parseUnsafe("0 16 1 * *"),
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
