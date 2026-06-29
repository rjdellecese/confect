import { FunctionSpec, Ref } from "@confect/core";
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import { describe, expect, test } from "vitest";
import * as CronJob from "@confect/server/CronJob";
import * as CronJobs from "@confect/server/CronJobs";

const makeMutationRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      args: () => Schema.Struct({}),
      returns: () => Schema.Void,
    }),
  );

const makeActionRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalAction({
      name,
      args: () => Schema.Struct({}),
      returns: () => Schema.Void,
    }),
  );

const makeMutationRefWithArgs = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
      name,
      args: () => Schema.Struct({ email: Schema.String }),
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

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 4 * * *"`,
    );
  });

  test("every minute", () => {
    const cron = Cron.make({
      minutes: [],
      hours: [],
      days: [],
      months: [],
      weekdays: [],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"* * * * *"`,
    );
  });

  test("every 15 minutes roundtrips", () => {
    const cron = Cron.unsafeParse("*/15 * * * *");
    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0,15,30,45 * * * *"`,
    );
  });

  test("specific weekdays", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [1, 3, 5],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 9 * * 1,3,5"`,
    );
  });

  test("complex multi-field schedule", () => {
    const cron = Cron.make({
      minutes: [0, 30],
      hours: [8, 12, 18],
      days: [1, 15],
      months: [1, 6],
      weekdays: [],
    });

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0,30 8,12,18 1,15 1,6 *"`,
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

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0,15,30,45 6,12,18 * * 1,3,5"`,
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

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 12 * * *"`,
    );
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

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 9 * * *"`,
    );
  });

  test("accepts a named UTC time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneUnsafeMakeNamed("UTC"),
    });

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 9 * * *"`,
    );
  });

  test("accepts a named Etc/UTC time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneUnsafeMakeNamed("Etc/UTC"),
    });

    expect(CronJobs.cronToConvexCronString(cron)).toMatchInlineSnapshot(
      `"0 9 * * *"`,
    );
  });

  test("throws on a non-UTC named time zone", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [9],
      days: [],
      months: [],
      weekdays: [],
      tz: DateTime.zoneUnsafeMakeNamed("America/New_York"),
    });

    expect(() =>
      CronJobs.cronToConvexCronString(cron),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Convex cron expressions are always evaluated in UTC, but this cron specifies the time zone "America/New_York". Either omit the timezone or use UTC.]`,
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
      `[Error: Convex cron expressions are always evaluated in UTC, but this cron specifies the time zone "+03:00". Either omit the timezone or use UTC.]`,
    );
  });
});

describe("durationToConvexIntervalSchedule", () => {
  test("converts seconds to interval seconds", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.seconds(30)))
      .toMatchInlineSnapshot(`
      {
        "seconds": 30,
        "type": "interval",
      }
    `);
  });

  test("converts minutes to interval minutes", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.minutes(5)))
      .toMatchInlineSnapshot(`
      {
        "minutes": 5,
        "type": "interval",
      }
    `);
  });

  test("converts hours to interval hours", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.hours(2)))
      .toMatchInlineSnapshot(`
      {
        "hours": 2,
        "type": "interval",
      }
    `);
  });

  test("prefers hours when evenly divisible", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.seconds(3600)))
      .toMatchInlineSnapshot(`
      {
        "hours": 1,
        "type": "interval",
      }
    `);
  });

  test("prefers minutes over seconds when evenly divisible", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.seconds(120)))
      .toMatchInlineSnapshot(`
      {
        "minutes": 2,
        "type": "interval",
      }
    `);
  });

  test("falls back to seconds when not divisible by minutes", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.seconds(45)))
      .toMatchInlineSnapshot(`
      {
        "seconds": 45,
        "type": "interval",
      }
    `);
  });

  test("handles large hour values", () => {
    expect(CronJobs.durationToConvexIntervalSchedule(Duration.hours(720)))
      .toMatchInlineSnapshot(`
      {
        "hours": 720,
        "type": "interval",
      }
    `);
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
    expect(jobs.cronJobs).toMatchInlineSnapshot(`{}`);
    expect(jobs.convexCronJobs.crons).toMatchInlineSnapshot(`{}`);
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
    expect(result.convexCronJobs.crons["clear sessions"])
      .toMatchInlineSnapshot(`
      {
        "args": [
          {},
        ],
        "name": "sessions:clearStale",
        "schedule": {
          "cron": "0 * * * *",
          "type": "cron",
        },
      }
    `);
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

    expect(Object.keys(result.cronJobs)).toMatchInlineSnapshot(`
      [
        "clear sessions",
        "send digest",
      ]
    `);
    expect(Object.keys(result.convexCronJobs.crons)).toMatchInlineSnapshot(`
      [
        "clear sessions",
        "send digest",
      ]
    `);
    expect(result.convexCronJobs.crons["send digest"]).toMatchInlineSnapshot(`
      {
        "args": [
          {},
        ],
        "name": "emails:sendDigest",
        "schedule": {
          "cron": "0 9 * * 1",
          "type": "cron",
        },
      }
    `);
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

    expect(Object.keys(empty.cronJobs)).toMatchInlineSnapshot(`[]`);
    expect(Object.keys(empty.convexCronJobs.crons)).toMatchInlineSnapshot(`[]`);
    expect(Object.keys(withJob.cronJobs)).toMatchInlineSnapshot(`
      [
        "clear sessions",
      ]
    `);
    expect(Object.keys(withJob.convexCronJobs.crons)).toMatchInlineSnapshot(`
      [
        "clear sessions",
      ]
    `);
  });

  test("adds an interval job and populates convexCronJobs", () => {
    const ref = makeMutationRef("health", "ping");
    const schedule = Duration.seconds(30);
    const cronJob = CronJob.make("ping", schedule, ref);

    const result = CronJobs.make().add(cronJob);

    expect(CronJob.isCronJob(result.cronJobs["ping"]!)).toBe(true);
    expect(result.convexCronJobs.crons["ping"]).toMatchInlineSnapshot(`
      {
        "args": [
          {},
        ],
        "name": "health:ping",
        "schedule": {
          "seconds": 30,
          "type": "interval",
        },
      }
    `);
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

    expect(result.convexCronJobs.crons["clear sessions"]!.schedule)
      .toMatchInlineSnapshot(`
      {
        "cron": "0 * * * *",
        "type": "cron",
      }
    `);
    expect(result.convexCronJobs.crons["ping"]!.schedule)
      .toMatchInlineSnapshot(`
      {
        "seconds": 30,
        "type": "interval",
      }
    `);
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

    expect(parsed).toMatchInlineSnapshot(`
      {
        "clear sessions": {
          "args": [
            {},
          ],
          "name": "sessions:clearStale",
          "schedule": {
            "cron": "0 * * * *",
            "type": "cron",
          },
        },
      }
    `);
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

    expect(result.convexCronJobs.crons["payment reminder"])
      .toMatchInlineSnapshot(`
      {
        "args": [
          {
            "email": "billing@example.com",
          },
        ],
        "name": "payments:sendEmail",
        "schedule": {
          "cron": "0 16 1 * *",
          "type": "cron",
        },
      }
    `);
  });

  test("passes encoded args to convexCronJobs for an interval schedule", () => {
    const ref = makeMutationRefWithArgs("notifications", "send");
    const cronJob = CronJob.make("send notification", Duration.hours(1), ref, {
      email: "user@example.com",
    });

    const result = CronJobs.make().add(cronJob);

    expect(result.convexCronJobs.crons["send notification"])
      .toMatchInlineSnapshot(`
      {
        "args": [
          {
            "email": "user@example.com",
          },
        ],
        "name": "notifications:send",
        "schedule": {
          "hours": 1,
          "type": "interval",
        },
      }
    `);
  });
});
