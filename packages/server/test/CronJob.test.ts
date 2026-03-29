import { FunctionSpec, Ref } from "@confect/core";
import { Cron, Duration, Schema } from "effect";
import { describe, expect, test } from "vitest";
import * as CronJob from "../src/CronJob";

const makeMutationRef = (convexFunctionName: string) =>
  Ref.make(
    convexFunctionName,
    FunctionSpec.internalMutation({
      name: convexFunctionName.split(":")[1]!,
      args: Schema.Struct({}),
      returns: Schema.Void,
    }),
  );

const makeMutationRefWithArgs = (convexFunctionName: string) =>
  Ref.make(
    convexFunctionName,
    FunctionSpec.internalMutation({
      name: convexFunctionName.split(":")[1]!,
      args: Schema.Struct({ email: Schema.String }),
      returns: Schema.Void,
    }),
  );

describe("CronJob.make", () => {
  test("creates a CronJob with a Cron schedule", () => {
    const ref = makeMutationRef("tasks:cleanup");
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
    const ref = makeMutationRef("health:ping");
    const schedule = Duration.seconds(30);

    const job = CronJob.make("ping", schedule, ref);

    expect(job.identifier).toBe("ping");
    expect(Duration.isDuration(job.schedule)).toBe(true);
    expect(job.ref).toBe(ref);
    expect(job.args).toEqual({});
  });

  test("creates a CronJob with args", () => {
    const ref = makeMutationRefWithArgs("payments:sendEmail");

    const job = CronJob.make("payment reminder", Duration.hours(1), ref, {
      email: "billing@example.com",
    });

    expect(job.identifier).toBe("payment reminder");
    expect(job.args).toEqual({ email: "billing@example.com" });
  });

  test("defaults args to {} when omitted", () => {
    const ref = makeMutationRef("tasks:cleanup");
    const job = CronJob.make("cleanup", Duration.seconds(10), ref);

    expect(job.args).toEqual({});
  });
});

describe("CronJob.isCronJob", () => {
  test("returns true for a CronJob", () => {
    const ref = makeMutationRef("tasks:cleanup");
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
