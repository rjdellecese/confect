import * as CronWindow from "@confect/server/CronWindow";
import type { CronJob as ConvexCronJob } from "convex/server";
import { describe, expect, expectTypeOf, test } from "@effect/vitest";
import * as Match from "effect/Match";

describe("CronWindow", () => {
  test.each([
    [CronWindow.hourly(), { _tag: "Hourly" }],
    [CronWindow.daily({ hourUtc: 17 }), { _tag: "Daily", hourUtc: 17 }],
    [
      CronWindow.weekly({ dayOfWeek: "monday", hourUtc: 9 }),
      { _tag: "Weekly", dayOfWeek: "monday", hourUtc: 9 },
    ],
    [
      CronWindow.monthly({ day: 1, hourUtc: 0 }),
      { _tag: "Monthly", day: 1, hourUtc: 0 },
    ],
  ])(
    "owns a calendar window with Confect field names: %j",
    (window, fields) => {
      expect(CronWindow.isCronWindow(window)).toBe(true);
      expect(window[CronWindow.TypeId]).toBe(CronWindow.TypeId);
      expect(window).toEqual(fields);
      expect(window).not.toHaveProperty("minuteUTC");
      expect(window).not.toHaveProperty("hourUTC");
      expect(window).not.toHaveProperty("type");
    },
  );

  test("does not recognize unowned records", () => {
    for (const value of [
      null,
      undefined,
      {},
      { type: "hourly" },
      { _tag: "Hourly" },
    ]) {
      expect(CronWindow.isCronWindow(value)).toBe(false);
    }
  });

  test("preserves input options and only constructs window fields", () => {
    const options = { hourUtc: 17, minuteUTC: 23, hourUTC: 4 };
    const window = CronWindow.daily(options);
    expect(options).toEqual({ hourUtc: 17, minuteUTC: 23, hourUTC: 4 });
    expect(window).toEqual({ _tag: "Daily", hourUtc: 17 });
    expect(CronWindow.hourly()).not.toBe(CronWindow.hourly());
  });

  test("supports exhaustive Effect tag matching and narrowing", () => {
    const describeWindow = Match.type<CronWindow.CronWindow>().pipe(
      Match.tag("Hourly", (window) => {
        expectTypeOf(window._tag).toEqualTypeOf<"Hourly">();
        expectTypeOf(window).not.toHaveProperty("hourUtc");
        return "hourly";
      }),
      Match.tag("Daily", (window) => {
        expectTypeOf(window._tag).toEqualTypeOf<"Daily">();
        expectTypeOf(window.hourUtc).toEqualTypeOf<number>();
        return `daily ${window.hourUtc}`;
      }),
      Match.tag("Weekly", (window) => {
        expectTypeOf(window._tag).toEqualTypeOf<"Weekly">();
        expectTypeOf(window.dayOfWeek).toEqualTypeOf<
          Parameters<typeof CronWindow.weekly>[0]["dayOfWeek"]
        >();
        return `weekly ${window.dayOfWeek} ${window.hourUtc}`;
      }),
      Match.tag("Monthly", (window) => {
        expectTypeOf(window._tag).toEqualTypeOf<"Monthly">();
        expectTypeOf(window.day).toEqualTypeOf<number>();
        return `monthly ${window.day} ${window.hourUtc}`;
      }),
      Match.exhaustive,
    );
    expect(describeWindow(CronWindow.hourly())).toBe("hourly");
    expect(describeWindow(CronWindow.daily({ hourUtc: 17 }))).toBe("daily 17");
    expect(
      describeWindow(CronWindow.weekly({ dayOfWeek: "monday", hourUtc: 9 })),
    ).toBe("weekly monday 9");
    expect(describeWindow(CronWindow.monthly({ day: 1, hourUtc: 0 }))).toBe(
      "monthly 1 0",
    );
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
    expectTypeOf<{ _tag: "Hourly" }>().not.toExtend<CronWindow.CronWindow>();
    expectTypeOf<CronWindow.CronWindow>().not.toHaveProperty("type");
    expectTypeOf<"Monday">().not.toExtend<
      Parameters<typeof CronWindow.weekly>[0]["dayOfWeek"]
    >();
    expectTypeOf<typeof CronWindow>().not.toHaveProperty("make");
  });
});
