import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import { DateTime, Duration, Effect } from "effect";

export interface ConfectScheduler {
  runAfter<FuncRef extends SchedulableFunctionReference>(
    delay: Duration.DurationInput,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<void>;
  runAt<FuncRef extends SchedulableFunctionReference>(
    timestamp: number | Date | DateTime.DateTime,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<void>;
}

export class ConfectSchedulerImpl implements ConfectScheduler {
  constructor(private scheduler: Scheduler) {}

  runAfter<FuncRef extends SchedulableFunctionReference>(
    delay: Duration.DurationInput,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<void> {
    return Effect.promise(() =>
      this.scheduler.runAfter(
        Duration.toMillis(delay),
        functionReference,
        ...args,
      ),
    );
  }
  runAt<FuncRef extends SchedulableFunctionReference>(
    timestamp: number | Date | DateTime.DateTime,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<void> {
    return Effect.promise(() =>
      this.scheduler.runAt(
        DateTime.isDateTime(timestamp)
          ? DateTime.toEpochMillis(timestamp)
          : timestamp,
        functionReference,
        ...args,
      ),
    );
  }
}
