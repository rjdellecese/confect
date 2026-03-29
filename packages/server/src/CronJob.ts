import type { Ref } from "@confect/core";
import type { Cron, Duration } from "effect";
import { Predicate } from "effect";

export const TypeId = "@confect/server/CronJob";
export type TypeId = typeof TypeId;

export interface CronJob {
  readonly [TypeId]: TypeId;

  readonly identifier: string;
  readonly schedule: Cron.Cron | Duration.Duration;
  readonly ref: Ref.AnyMutation | Ref.AnyAction;
  readonly args: Record<string, unknown>;
}

export const isCronJob = (u: unknown): u is CronJob =>
  Predicate.hasProperty(u, TypeId);

type OptionalArgs<R extends Ref.AnyMutation | Ref.AnyAction> =
  keyof Ref.Args<R> extends never ? [args?: Ref.Args<R>] : [args: Ref.Args<R>];

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = (
  identifier: string,
  schedule: Cron.Cron | Duration.Duration,
  ref: Ref.AnyMutation | Ref.AnyAction,
  args: Record<string, unknown>,
): CronJob =>
  Object.assign(Object.create(Proto), {
    identifier,
    schedule,
    ref,
    args,
  });

export const make = <R extends Ref.AnyMutation | Ref.AnyAction>(
  identifier: string,
  schedule: Cron.Cron | Duration.Duration,
  ref: R,
  ...args: OptionalArgs<R>
): CronJob => makeProto(identifier, schedule, ref, args[0] ?? {});
