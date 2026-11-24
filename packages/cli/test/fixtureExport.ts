import { assert } from "@effect/vitest";
import * as Predicate from "effect/Predicate";

export const callFixtureExport = (
  target: unknown,
  receiver: unknown,
  ...args: ReadonlyArray<unknown>
): unknown => {
  assert(Predicate.isFunction(target), "Expected a callable fixture export");
  return Reflect.apply(target, receiver, args);
};
