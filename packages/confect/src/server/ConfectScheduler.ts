import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import { Context, DateTime, Duration, Effect, Layer } from "effect";

const make = (scheduler: Scheduler) => ({
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

export const ConfectScheduler = Context.GenericTag<ReturnType<typeof make>>(
  "@rjdellecese/confect/server/ConfectScheduler",
);
export type ConfectScheduler = typeof ConfectScheduler.Identifier;

export const layer = (scheduler: Scheduler) =>
  Layer.succeed(ConfectScheduler, make(scheduler));
