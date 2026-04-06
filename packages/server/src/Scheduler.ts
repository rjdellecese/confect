import { Ref } from "@confect/core";
import type {
  SchedulableFunctionReference,
  Scheduler as ConvexScheduler,
} from "convex/server";
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Match,
  Schema,
} from "effect";

type OptionalArgs<R extends Ref.AnyMutation | Ref.AnyAction> =
  keyof Ref.Args<R> extends never ? [args?: Ref.Args<R>] : [args: Ref.Args<R>];

const encodeArgs = (
  ref: Ref.AnyMutation | Ref.AnyAction,
  args: Record<string, unknown>,
) => {
  const functionSpec = Ref.getFunctionSpec(ref);
  return Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confect) => Schema.encodeSync(confect.args)(args)),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );
};

const make = (scheduler: ConvexScheduler) => ({
  runAfter: <R extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: R,
    ...args: OptionalArgs<R>
  ) => {
    const delayMs = Duration.toMillis(delay);
    const schedulableFunctionReference = Ref.getConvexFunctionName(
      ref,
    ) as unknown as SchedulableFunctionReference;
    const encodedArgs = encodeArgs(
      ref,
      (args[0] ?? {}) as Record<string, unknown>,
    );

    return Effect.promise(() =>
      scheduler.runAfter(delayMs, schedulableFunctionReference, encodedArgs),
    );
  },
  runAt: <R extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: R,
    ...args: OptionalArgs<R>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);
    const schedulableFunctionReference = Ref.getConvexFunctionName(
      ref,
    ) as unknown as SchedulableFunctionReference;
    const encodedArgs = encodeArgs(
      ref,
      (args[0] ?? {}) as Record<string, unknown>,
    );

    return Effect.promise(() =>
      scheduler.runAt(timestamp, schedulableFunctionReference, encodedArgs),
    );
  },
});

export const Scheduler = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/Scheduler",
);
export type Scheduler = typeof Scheduler.Identifier;

export const layer = (scheduler: ConvexScheduler) =>
  Layer.succeed(Scheduler, make(scheduler));
