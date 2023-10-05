import {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import { Effect } from "effect";

export interface EffectScheduler {
  runAfter<FuncRef extends SchedulableFunctionReference>(
    delayMs: number,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<never, never, void>;
  runAt<FuncRef extends SchedulableFunctionReference>(
    timestamp: number | Date,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<never, never, void>;
}

export class EffectSchedulerImpl implements EffectScheduler {
  constructor(private scheduler: Scheduler) {}
  runAfter<FuncRef extends SchedulableFunctionReference>(
    delayMs: number,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<never, never, void> {
    return Effect.promise(() =>
      this.scheduler.runAfter(delayMs, functionReference, ...args)
    );
  }
  runAt<FuncRef extends SchedulableFunctionReference>(
    timestamp: number | Date,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ): Effect.Effect<never, never, void> {
    return Effect.promise(() =>
      this.scheduler.runAt(timestamp, functionReference, ...args)
    );
  }
}
