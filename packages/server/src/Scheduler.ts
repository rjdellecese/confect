import { Ref } from "@confect/core";
import type { Scheduler as ConvexScheduler } from "convex/server";
import { Context, DateTime, Duration, Effect, Layer } from "effect";

type OptionalArgs<Ref_ extends Ref.AnyMutation | Ref.AnyAction> =
  keyof Ref.Args<Ref_> extends never
    ? [args?: Ref.Args<Ref_>]
    : [args: Ref.Args<Ref_>];

const make = (scheduler: ConvexScheduler) => ({
  runAfter: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: OptionalArgs<Ref_>
  ) => {
    const delayMs = Duration.toMillis(delay);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Ref_>,
    );

    return Effect.promise(() =>
      scheduler.runAfter(delayMs, functionReference, encodedArgs),
    );
  },
  runAt: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: Ref_,
    ...args: OptionalArgs<Ref_>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);
    const functionReference = Ref.getFunctionReference(ref);
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Ref_>,
    );

    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, encodedArgs),
    );
  },
});

export const Scheduler = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/Scheduler",
);
export type Scheduler = typeof Scheduler.Identifier;

export const layer = (scheduler: ConvexScheduler) =>
  Layer.succeed(Scheduler, make(scheduler));
