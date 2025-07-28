import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import { DateTime, Duration, Effect, Layer } from "effect";

const make = (scheduler: Scheduler) => ({
  runAfter: <FuncRef extends SchedulableFunctionReference>(
    delay: Duration.Duration,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => {
    const delayMs = Duration.toMillis(delay);

    // TODO: Which errors might occur?
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

    // TODO: Which errors might occur?
    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, ...args),
    );
  },
});

export class ConfectScheduler extends Effect.Tag(
  "@rjdellecese/confect/ConfectScheduler",
)<ConfectScheduler, ReturnType<typeof make>>() {
  static readonly layer = (scheduler: Scheduler) =>
    Layer.succeed(this, make(scheduler));
}
