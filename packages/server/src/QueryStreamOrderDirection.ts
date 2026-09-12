/**
 * The direction a stream is ordered in. Tracked covariantly in the type: a
 * stream of a known direction is also a stream of `"asc" | "desc"`, the
 * class default, so annotations that omit the direction accept every
 * stream. Combining streams of different known directions—`merge`, or a
 * `flatMap` whose inner streams run the other way—is a type error; a
 * direction chosen at runtime types as the union, and the runtime check
 * catches what the types can't see (`merge` throws when the streams are
 * combined, `flatMap` fails when the join runs).
 *
 * @experimental
 */
export type QueryStreamOrderDirection = "asc" | "desc";

/**
 * The opposite of a direction; a runtime-chosen direction stays the union.
 *
 * @experimental
 */
export type Flip<Direction extends QueryStreamOrderDirection> =
  Direction extends "asc" ? "desc" : "asc";

/**
 * @experimental
 */
export const flip = <Direction extends QueryStreamOrderDirection>(
  direction: Direction,
): Flip<Direction> => (direction === "asc" ? "desc" : "asc") as Flip<Direction>;
