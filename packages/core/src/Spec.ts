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
 * The generated project spec that describes function groups and their
 * middleware. Import the codegen-assembled spec rather than constructing it by
 * hand; it does not describe the database schema.
 *
 * **Details**
 *
 * A spec can contain both Convex groups and Node.js action groups. The runtime
 * belongs to each group and its functions, not to the project spec.
 *
 * @category Models
 */
export interface Spec<
  Groups_ extends Record.ReadonlyRecord<string, GroupSpec.AnyWithProps> = {},
> {
  /**
   * The generated group record, preserving each group's precise declaration
   * type.
   *
   * @category Models
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
