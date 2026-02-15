import { Predicate, Record } from "effect";
import type * as GroupSpec from "./GroupSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export const TypeId = "@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface Spec<
  Runtime extends RuntimeAndFunctionType.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime> = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime;
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups_>]: GroupSpec.WithName<
      Groups_,
      GroupName
    >;
  };

  add<Group extends GroupSpec.AnyWithPropsWithRuntime<Runtime>>(
    group: Group,
  ): Spec<Runtime, Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Spec<
  RuntimeAndFunctionType.Runtime,
  GroupSpec.AnyWithProps
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends Spec<Runtime, GroupSpec.AnyWithPropsWithRuntime<Runtime>> {}

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
  Runtime extends RuntimeAndFunctionType.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime>,
>({
  runtime,
  groups,
}: {
  runtime: Runtime;
  groups: Record.ReadonlyRecord<string, Groups_>;
}): Spec<Runtime, Groups_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    groups,
  });

export const make = (): Spec<"Convex"> =>
  makeProto({ runtime: "Convex", groups: {} });

export const makeNode = (): Spec<"Node"> =>
  makeProto({ runtime: "Node", groups: {} });
