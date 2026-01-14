import { Predicate, Record } from "effect";
import type * as GroupSpec from "./GroupSpec";

export const TypeId = "@confect/core/api/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

export interface Spec<Groups_ extends GroupSpec.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups_>]: GroupSpec.WithName<
      Groups_,
      GroupName
    >;
  };

  add<Group extends GroupSpec.AnyWithProps>(
    group: Group,
  ): Spec<Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Spec<GroupSpec.AnyWithProps> {}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_["groups"][keyof Spec_["groups"]];

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.AnyWithProps>(this: AnyWithProps, group: Group) {
    const group_ = group as unknown as GroupSpec.AnyWithProps;

    return makeProto({
      groups: Record.set(this.groups, group_.name, group_),
    });
  },
};

const makeProto = <Groups_ extends GroupSpec.AnyWithProps>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups_>;
}): Spec<Groups_> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): Spec => makeProto({ groups: {} });
