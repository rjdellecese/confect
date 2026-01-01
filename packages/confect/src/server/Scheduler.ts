import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler as ConvexScheduler,
} from "convex/server";
import { Context, DateTime, Duration, Effect, Layer } from "effect";

const make = (scheduler: ConvexScheduler) => ({
  runAfter: <FuncRef extends SchedulableFunctionReference>(
    delay: Duration.Duration,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => {
    const delayMs = Duration.toMillis(delay);

    return Effect.promise(() =>
      scheduler.runAfter(delayMs, functionReference, ...args),
    );
  },
  runAt: <FuncRef extends SchedulableFunctionReference>(
    dateTime: DateTime.DateTime,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);

    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, ...args),
    );
  },
});

export const Scheduler = Context.GenericTag<ReturnType<typeof make>>(
  "@rjdellecese/confect/server/Scheduler",
);
export type Scheduler = typeof Scheduler.Identifier;

export const layer = (scheduler: ConvexScheduler) =>
  Layer.succeed(Scheduler, make(scheduler));
