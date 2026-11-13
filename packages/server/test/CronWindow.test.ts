import * as CronWindow from "@confect/server/CronWindow";
import type { CronJob as ConvexCronJob } from "convex/server";
import { describe, expect, expectTypeOf, test } from "@effect/vitest";

describe("CronWindow", () => {
  test.each([
    [CronWindow.hourly(), { type: "hourly" }],
    [CronWindow.daily({ hourUtc: 17 }), { type: "daily", hourUtc: 17 }],
    [
      CronWindow.weekly({ dayOfWeek: "monday", hourUtc: 9 }),
      { type: "weekly", dayOfWeek: "monday", hourUtc: 9 },
    ],
    [
      CronWindow.monthly({ day: 1, hourUtc: 0 }),
      { type: "monthly", day: 1, hourUtc: 0 },
    ],
  ])(
    "owns a calendar window with Confect field names: %j",
    (window, fields) => {
      expect(CronWindow.isCronWindow(window)).toBe(true);
      expect(window[CronWindow.TypeId]).toBe(CronWindow.TypeId);
      expect(window).toEqual(fields);
      expect(window).not.toHaveProperty("minuteUTC");
      expect(window).not.toHaveProperty("hourUTC");
    },
  );

  test("does not recognize unowned records", () => {
    for (const value of [null, undefined, {}, { type: "hourly" }]) {
      expect(CronWindow.isCronWindow(value)).toBe(false);
    }
  });

  test("preserves input options and only constructs window fields", () => {
    const options = { hourUtc: 17, minuteUTC: 23, hourUTC: 4 };
    const window = CronWindow.daily(options);
    expect(options).toEqual({ hourUtc: 17, minuteUTC: 23, hourUTC: 4 });
    expect(window).toEqual({ type: "daily", hourUtc: 17 });
    expect(CronWindow.hourly()).not.toBe(CronWindow.hourly());
  });

  test("retains native calendar constraints without exposing native casing", () => {
    expectTypeOf(CronWindow.hourly).parameters.toEqualTypeOf<[]>();
    expectTypeOf(CronWindow.daily).parameter(0).toEqualTypeOf<{
      readonly hourUtc: number;
    }>();
    expectTypeOf(CronWindow.weekly).parameter(0).toEqualTypeOf<{
      readonly hourUtc: number;
      readonly dayOfWeek: Extract<
        ConvexCronJob["schedule"],
        { type: "weekly" }
      >["dayOfWeek"];
    }>();
    expectTypeOf(CronWindow.monthly).parameter(0).toEqualTypeOf<{
      readonly hourUtc: number;
      readonly day: number;
    }>();
    expectTypeOf<{ type: "hourly" }>().not.toExtend<CronWindow.CronWindow>();
    expectTypeOf<"Monday">().not.toExtend<
      Parameters<typeof CronWindow.weekly>[0]["dayOfWeek"]
    >();
    expectTypeOf<typeof CronWindow>().not.toHaveProperty("make");
  });
});
