import type { ConvexEventLog } from "@confect/platform";
import { expectTypeOf, it } from "@effect/vitest";

it("exposes delivered log events as a union discriminated by topic", () => {
  expectTypeOf<{
    topic: "verification";
    timestamp: number;
    message: string;
  }>().toExtend<ConvexEventLog>();
  expectTypeOf<
    Extract<ConvexEventLog, { topic: "verification" }>["message"]
  >().toBeString();
  expectTypeOf<{ topic: "verification" }>().not.toExtend<ConvexEventLog>();
});
