import type { RegistryItems } from "../RegistryItems";
import * as Predicate from "effect/Predicate";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Record from "effect/Record";

interface NestedObject<T> {
  [key: string]: T | NestedObject<T>;
}

/**
 * @internal
 */
export const mapLeaves = <T, U>(
  obj: RegistryItems,
  leafRefinement: Predicate.Refinement<unknown, T>,
  f: (value: T) => U,
): NestedObject<U> => {
  const result: NestedObject<U> = {};
  for (const key in obj) {
    const value = obj[key];
    result[key] = leafRefinement(value)
      ? f(value)
      : mapLeaves(
          Predicate.isObject(value) ? value : Object.assign({}, value),
          leafRefinement,
          f,
        );
  }
  return result;
};

const collectBranchLeaves = <T>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  path: Array<string> = [],
): Array<{ path: Array<string>; values: Record<string, T> }> => {
  const leaves = Record.filter(obj, leafRefinement);
  const hasLeaves = Record.keys(leaves).length > 0;

  const currentBranch = hasLeaves ? [{ path, values: leaves }] : [];

  const nestedBranches = Array.flatMap(
    Record.keys<string, T | NestedObject<T>>(obj),
    (key) => {
      const value = obj[key];

      if (!leafRefinement(value) && typeof value === "object") {
        return collectBranchLeaves(value, leafRefinement, [...path, key]);
      }
      return [];
    },
  );

  return [...currentBranch, ...nestedBranches];
};

/**
 * @internal
 */
export const forEachBranchLeaves = <T, A, E, R>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  f: (branchLeaves: {
    path: Array<string>;
    values: Record<string, T>;
  }) => Effect.Effect<A, E, R>,
): Effect.Effect<void, E, R> => {
  const branchLeaves = collectBranchLeaves(obj, leafRefinement);
  return Effect.forEach(branchLeaves, f, { concurrency: 1, discard: true });
};

/**
 * @internal
 */
export const setNestedProperty = <T extends object>(
  obj: T,
  path: Array<PropertyKey>,
  value: unknown,
): T => {
  if (path.length === 0) {
    return obj;
  }

  if (path.length === 1) {
    const key = path[0];
    return { ...obj, [key]: value };
  }

  const [key, ...tail] = path;
  const branch = Predicate.hasProperty(obj, key) ? obj[key] : undefined;
  const nested = Predicate.isObjectKeyword(branch)
    ? branch
    : Object.assign({}, branch);
  return { ...obj, [key]: setNestedProperty(nested, tail, value) };
};
