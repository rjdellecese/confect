import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as GroupSpec from "./GroupSpec";

/**
 * The key for the group record in a function spec. For a hand-authored
 * component wrapper, place the named groups under this key and pass the spec to
 * `Component.make`. Application code normally imports the generated spec.
 *
 * @category Type IDs
 */
export const TypeId = "~@confect/core/Spec";
/**
 * The type of the key that identifies a spec's named groups.
 *
 * @category Type IDs
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * A spec describing function groups and their middleware, not the database
 * schema. Import the codegen-assembled spec for your project; build a subset by
 * hand to wrap functions from an existing Convex component.
 *
 * For the application's complete contract, use `typeof spec` with a type-only
 * default import from `confect/_generated/spec`. Specify the group record
 * explicitly for a handwritten subset.
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
   * The group record, preserving each group's precise declaration type.
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
 * Assembles named groups for the generated project contract. Default-import
 * `confect/_generated/spec` rather than building the root directly.
 *
 * @internal
 */
export const fromGroups = (
  record: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
): AnyWithProps => ({
  [TypeId]: Record.map(record, (group, name) =>
    GroupSpec.withName(name, group),
  ),
});
