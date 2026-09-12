import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Struct from "effect/Struct";
import * as GroupSpec from "./GroupSpec";

export const TypeId = "~@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * A Confect spec: a flat container of function groups. Groups may be of any
 * runtime—a group built with `GroupSpec.makeNode()` (a Node action group) sits
 * alongside `GroupSpec.make()` groups in the same namespace. The runtime of a
 * group lives on the group itself (`GroupSpec.runtime`) and on each function's
 * `RuntimeAndFunctionType`; the spec does not carry a runtime of its own.
 */
export interface Spec<
  Groups_ extends Record.ReadonlyRecord<string, GroupSpec.AnyWithProps> = {},
> {
  readonly [TypeId]: Readonly<Groups_>;

  add<Group extends GroupSpec.AnyWithProps>(
    group: Group,
  ): Spec<
    Struct.Assign<Groups_, Record.ReadonlyRecord<GroupSpec.Name<Group>, Group>>
  >;

  addAt<const Name extends string, Group extends GroupSpec.AnyWithProps>(
    name: Name,
    group: Group,
  ): Spec<
    Struct.Assign<
      Groups_,
      Record.ReadonlyRecord<Name, GroupSpec.NamedAt<Group, Name>>
    >
  >;
}

export interface Any {
  readonly [TypeId]: unknown;
}

export interface AnyWithProps extends Any {
  readonly [TypeId]: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>;
}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_[TypeId][keyof Spec_[TypeId]];

/** The group record stored by a spec, with its precise member types. */
export const groups = <Spec_ extends AnyWithProps>(
  self: Spec_,
): Spec_[TypeId] => self[TypeId];

const makeRecord = <
  Groups_ extends Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
>(
  record: Groups_,
): Spec<Groups_> => ({
  [TypeId]: record,
  add<Group extends GroupSpec.AnyWithProps>(group: Group) {
    return makeRecord(
      Struct.assign(
        record,
        Record.singleton<GroupSpec.Name<Group>, Group>(group.name, group),
      ),
    );
  },
  addAt<const Name extends string, Group extends GroupSpec.AnyWithProps>(
    name: Name,
    group: Group,
  ) {
    return makeRecord(
      Struct.assign(
        record,
        Record.singleton(name, GroupSpec.withName(name, group)),
      ),
    );
  },
});

export const make = (): Spec => makeRecord({});
