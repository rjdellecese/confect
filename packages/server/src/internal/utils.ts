import type { Predicate } from "effect";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Record from "effect/Record";

type NestedObject<T> = {
  [key: string]: T | NestedObject<T>;
};

/**
 * @internal
 */
export const mapLeaves = <T, U>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  f: (value: T) => U,
): NestedObject<U> => {
  const result: NestedObject<U> = {};

  for (const key in obj) {
    const value = obj[key];

    if (leafRefinement(value)) {
      result[key] = f(value);
    } else {
      result[key] = mapLeaves(value, leafRefinement, f);
    }
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

  const nestedBranches = Array.flatMap(Record.keys(obj), (key) => {
    const value = obj[key];

    if (!leafRefinement(value) && typeof value === "object") {
      return collectBranchLeaves(value, leafRefinement, [...path, key]);
    }
    return [];
  });

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
  return {
    ...obj,
    [key]: setNestedProperty((obj as any)[key] ?? {}, tail, value),
  };
};
