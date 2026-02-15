import { Predicate, Record } from "effect";
import type * as GroupSpec from "./GroupSpec";
import type * as Runtime from "./Runtime";

export const TypeId = "@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface Spec<
  Runtime_ extends Runtime.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime_> = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime_;
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups_>]: GroupSpec.WithName<
      Groups_,
      GroupName
    >;
  };

  add<Group extends GroupSpec.AnyWithPropsWithRuntime<Runtime_>>(
    group: Group,
  ): Spec<Runtime_, Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Spec<
  Runtime.Runtime,
  GroupSpec.AnyWithProps
> {}

export interface AnyWithPropsWithRuntime<
  Runtime_ extends Runtime.Runtime,
> extends Spec<Runtime_, GroupSpec.AnyWithPropsWithRuntime<Runtime_>> {}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_["groups"][keyof Spec_["groups"]];

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.AnyWithProps>(this: AnyWithProps, group: Group) {
    return makeProto({
      runtime: this.runtime,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  Runtime_ extends Runtime.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime_>,
>({
  runtime,
  groups,
}: {
  runtime: Runtime_;
  groups: Record.ReadonlyRecord<string, Groups_>;
}): Spec<Runtime_, Groups_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    groups,
  });

export const make = (): Spec<"Convex"> =>
  makeProto({ runtime: "Convex", groups: {} });

export const makeNode = (): Spec<"Node"> =>
  makeProto({ runtime: "Node", groups: {} });
