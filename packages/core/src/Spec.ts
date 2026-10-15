import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
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
}

export interface Any {
  readonly [TypeId]: unknown;
}

export interface AnyWithProps extends Any {
  readonly [TypeId]: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>;
}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_[TypeId][keyof Spec_[TypeId]];

/**
 * The group record stored by a spec, with its precise member types.
 */
export const groups = <Spec_ extends AnyWithProps>(
  self: Spec_,
): Spec_[TypeId] => self[TypeId];

export const fromGroups = (
  record: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
): AnyWithProps => ({
  [TypeId]: Record.map(record, (group, name) =>
    GroupSpec.withName(name, group),
  ),
});
