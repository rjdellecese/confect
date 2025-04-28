import { DateTime, Duration, Effect } from "effect";
import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";

export class ConvexScheduler extends Effect.Tag(
  "@rjdellecese/confect/ConvexScheduler",
)<ConvexScheduler, Scheduler>() {}

export class ConfectScheduler extends Effect.Service<ConfectScheduler>()(
  "@rjdellecese/confect/ConfectScheduler",
  {
    effect: Effect.gen(function* () {
      const scheduler = yield* ConvexScheduler;

      return {
        runAfter: <FuncRef extends SchedulableFunctionReference>(
          delay: Duration.Duration,
          functionReference: FuncRef,
          ...args: OptionalRestArgs<FuncRef>
        ) =>
          Effect.gen(function* () {
            const delayMs = Duration.toMillis(delay);

            return Effect.promise(() =>
              scheduler.runAfter(delayMs, functionReference, ...args),
            );
          }),
        runAt: <FuncRef extends SchedulableFunctionReference>(
          dateTime: DateTime.DateTime,
          functionReference: FuncRef,
          ...args: OptionalRestArgs<FuncRef>
        ) =>
          Effect.gen(function* () {
            const timestamp = DateTime.toEpochMillis(dateTime);

            return Effect.promise(() =>
              scheduler.runAt(timestamp, functionReference, ...args),
            );
          }),
      };
    }),
  },
) {}
