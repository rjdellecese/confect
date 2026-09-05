import { Ref } from "@confect/core";
import type { GenericId } from "@confect/core/GenericId";
import type { Scheduler as ConvexScheduler } from "convex/server";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const make = (scheduler: ConvexScheduler) => ({
  runAfter: <Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
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
    ...args: Ref.OptionalArgs<Ref_>
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

export const Scheduler = Context.Service<ReturnType<typeof make>>(
  "@confect/server/Scheduler",
);
export type Scheduler = typeof Scheduler.Identifier;

export interface Service<Scope extends string = ""> {
  runAfter<Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ): Effect.Effect<GenericId<"_scheduled_functions", Scope>>;
  runAt<Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ): Effect.Effect<GenericId<"_scheduled_functions", Scope>>;
}

export type ForScope<Scope extends string> = Scope extends ""
  ? Scheduler
  : { readonly "~ScopedScheduler": Scope };

export const forScope = <Scope extends string = "">(): Context.Service<
  ForScope<Scope>,
  Service<Scope>
> => Context.Service("@confect/server/Scheduler");

export const layer = <Scope extends string = "">(
  scheduler: ConvexScheduler,
  _scope?: Scope,
) =>
  // Scopes are phantom: Convex still receives and returns the same ID strings.
  Layer.succeed(
    forScope<Scope>(),
    make(scheduler) as unknown as Service<Scope>,
  );
