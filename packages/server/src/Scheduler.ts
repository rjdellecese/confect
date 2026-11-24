import type * as IdScope from "@confect/core/IdScope";
import type * as Types from "effect/Types";
import { Ref } from "@confect/core";
import type { GenericId } from "@confect/core/GenericId";
import type { Scheduler as ConvexScheduler } from "convex/server";
import type { GenericId as ConvexGenericId } from "convex/values";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const make = (scheduler: ConvexScheduler) => ({
  /**
   * Cancels a scheduled invocation by its scheduled-function ID. Cancellation
   * does not undo work that has already run.
   *
   * @category Scheduling
   *
   * @param id - ID in `_scheduled_functions` returned by `runAfter` or `runAt`.
   *
   * @returns An Effect that completes without a value. A Convex rejection is a
   *   defect.
   */
  cancel: (id: ConvexGenericId<"_scheduled_functions">) =>
    Effect.promise(() => scheduler.cancel(id)),
  /**
   * Schedules a mutation or action to run after the given delay.
   *
   * @category Scheduling
   *
   * @param delay - Effect duration, converted to milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the scheduled-function ID. A Convex rejection
   *   is a defect.
   *
   * @throws If the arguments cannot be encoded, before the Effect is returned.
   */
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
  /**
   * Schedules a mutation or action to run at the given instant.
   *
   * @category Scheduling
   *
   * @param dateTime - Effect date and time, converted to epoch milliseconds.
   * @param ref - Generated mutation or action ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the scheduled-function ID. A Convex rejection
   *   is a defect.
   *
   * @throws If the arguments cannot be encoded, before the Effect is returned.
   */
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

/**
 * Tag for scheduling mutations and actions or canceling a scheduled invocation.
 * Yield the generated `Scheduler` tag in a mutation, action, or HTTP handler.
 * Scheduled-function IDs belong to the scheduling application or component,
 * even when the invoked function belongs to a different scope.
 *
 * @category Tags
 */
export const Scheduler =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/Scheduler");
/**
 * Effect environment requirement for an operation that schedules or cancels a
 * function through the generated `Scheduler` service.
 *
 * @category Context
 */
export type Scheduler = typeof Scheduler.Identifier;

/**
 * Service for scheduling mutations and actions in a mutation, action, or HTTP
 * handler.
 *
 * @remarks
 *   Codegen support: this type describes the generated service. Yield
 *   `Scheduler` from `confect/_generated/services` to use its operations.
 *
 * @category Services
 */
export interface Service<Scope extends IdScope.IdScope = IdScope.App> {
  /**
   * Cancels a scheduled invocation by its ID in this scope. Cancellation does
   * not undo work already performed; a Convex rejection is a defect.
   *
   * @category Scheduling
   */
  cancel(id: GenericId<"_scheduled_functions", Scope>): Effect.Effect<void>;
  /**
   * Schedules a mutation or action after the given duration and returns a
   * scheduled-function ID in this scope. Omit the arguments for an
   * argument-free ref. Invalid arguments throw during encoding; a Convex
   * rejection is a defect.
   *
   * @category Scheduling
   */
  runAfter<Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    delay: Duration.Duration,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ): Effect.Effect<GenericId<"_scheduled_functions", Scope>>;
  /**
   * Schedules a mutation or action at the given instant and returns a
   * scheduled-function ID in this scope. Omit the arguments for an
   * argument-free ref. Invalid arguments throw during encoding; a Convex
   * rejection is a defect.
   *
   * @category Scheduling
   */
  runAt<Ref_ extends Ref.AnyMutation | Ref.AnyAction>(
    dateTime: DateTime.DateTime,
    ref: Ref_,
    ...args: Ref.OptionalArgs<Ref_>
  ): Effect.Effect<GenericId<"_scheduled_functions", Scope>>;
}

/**
 * Types the generated `Scheduler` requirement for its database scope. Use the
 * identically named type from `confect/_generated/services`.
 *
 * @internal
 */
export type ForScope<Scope extends IdScope.IdScope> = [Scope] extends [
  IdScope.App,
]
  ? Scheduler
  : { readonly "~ScopedScheduler": Types.Invariant<Scope> };

/**
 * Constructs a scoped tag for codegen. Yield the generated `Scheduler` tag from
 * `confect/_generated/services` instead.
 *
 * @internal
 */
export const forScope = <
  Scope extends IdScope.IdScope = IdScope.App,
>(): Context.Service<ForScope<Scope>, Service<Scope>> =>
  Context.Service("@confect/server/Scheduler");

/**
 * @internal
 */
export const layer = <Scope extends IdScope.IdScope = IdScope.App>(
  scheduler: ConvexScheduler,
  _scope?: Scope,
) =>
  // Scopes are phantom: Convex still receives and returns the same ID strings.
  Layer.succeed(
    forScope<Scope>(),
    make(scheduler) as unknown as Service<Scope>,
  );
