import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as GroupSpec from "./GroupSpec";

/**
 * @internal
 */
export const TypeId = "~@confect/core/Spec";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * A Confect spec: a flat container of function groups. Groups may be of any
 * runtime—a group built with `GroupSpec.makeNode()` (a Node action group) sits
 * alongside `GroupSpec.make()` groups in the same namespace. The runtime of a
 * group lives on the group itself (`GroupSpec.runtime`) and on each function's
 * `RuntimeAndFunctionType`; the spec does not carry a runtime of its own.
 *
 * Use the codegen-assembled project spec rather than assembling this container
 * manually. It describes functions and middleware, not the database schema.
 */
export interface Spec<
  Groups_ extends Record.ReadonlyRecord<string, GroupSpec.AnyWithProps> = {},
> {
  /**
   * The generated group record, preserving each group's precise declaration
   * type.
   */
  readonly [TypeId]: Readonly<Groups_>;
}

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: unknown;
}

/**
 * @internal
 */
export interface AnyWithProps extends Any {
  readonly [TypeId]: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>;
}

/**
 * @internal
 */
export type Groups<Spec_ extends AnyWithProps> =
  Spec_[TypeId][keyof Spec_[TypeId]];

/**
 * The group record stored by a spec, with its precise member types.
 *
 * @internal
 */
export const groups = <Spec_ extends AnyWithProps>(
  self: Spec_,
): Spec_[TypeId] => self[TypeId];

/**
 * @internal
 */
export const fromGroups = (
  record: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
): AnyWithProps => ({
  [TypeId]: Record.map(record, (group, name) =>
    GroupSpec.withName(name, group),
  ),
});
