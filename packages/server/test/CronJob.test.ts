import { FunctionSpec, Ref } from "@confect/core";
import * as Cron from "effect/Cron";
import * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import { describe, expect, test } from "@effect/vitest";
import * as CronJob from "@confect/server/CronJob";
import * as CronWindow from "@confect/server/CronWindow";

const makeMutationRef = (functionNamespace: string, name: string) =>
  Ref.make(
    functionNamespace,
    FunctionSpec.internalMutation({
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

describe("CronJob.make", () => {
  test("keeps window, ref and args identities without evaluating schemas", () => {
    const builds = { args: 0, returns: 0, error: 0 };
    const ref = Ref.make(
      "tasks",
      FunctionSpec.internalMutation({
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
    const schedule = CronWindow.daily({ hourUtc: 17 });
    const args = { count: 42 };
    const job = CronJob.make("count", schedule, ref, args);

    expect(job.schedule).toBe(schedule);
    expect(job.ref).toBe(ref);
    expect(job.args).toBe(args);
    expect(builds).toEqual({ args: 0, returns: 0, error: 0 });
  });

  test("creates a CronJob with a Cron schedule", () => {
    const ref = makeMutationRef("tasks", "cleanup");
    const cron = Cron.make({
      minutes: [0],
      hours: [4],
      days: [],
      months: [],
      weekdays: [],
    });

    const job = CronJob.make("cleanup", cron, ref);

    expect(job.identifier).toBe("cleanup");
    expect(Cron.isCron(job.schedule)).toBe(true);
    expect(job.ref).toBe(ref);
    expect(job.args).toEqual({});
  });

  test("creates a CronJob with a Duration schedule", () => {
    const ref = makeMutationRef("health", "ping");
    const schedule = Duration.seconds(30);

    const job = CronJob.make("ping", schedule, ref);

    expect(job.identifier).toBe("ping");
    expect(Duration.isDuration(job.schedule)).toBe(true);
    expect(job.ref).toBe(ref);
    expect(job.args).toEqual({});
  });

  test("creates a CronJob with args", () => {
    const ref = makeMutationRefWithArgs("payments", "sendEmail");

    const job = CronJob.make("payment reminder", Duration.hours(1), ref, {
      email: "billing@example.com",
    });

    expect(job.identifier).toBe("payment reminder");
    expect(job.args).toEqual({ email: "billing@example.com" });
  });

  test("defaults args to {} when omitted", () => {
    const ref = makeMutationRef("tasks", "cleanup");
    const job = CronJob.make("cleanup", Duration.seconds(10), ref);

    expect(job.args).toEqual({});
  });
});

describe("CronJob.isCronJob", () => {
  test("returns true for a CronJob", () => {
    const ref = makeMutationRef("tasks", "cleanup");
    const job = CronJob.make("cleanup", Duration.seconds(10), ref);

    expect(CronJob.isCronJob(job)).toBe(true);
  });

  test("returns false for a plain object", () => {
    expect(CronJob.isCronJob({ identifier: "x" })).toBe(false);
  });

  test("returns false for null", () => {
    expect(CronJob.isCronJob(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(CronJob.isCronJob(undefined)).toBe(false);
  });
});
