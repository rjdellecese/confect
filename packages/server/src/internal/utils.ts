import * as Predicate from "effect/Predicate";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Record from "effect/Record";

type NestedObject<T> = {
  [key: string]: T | NestedObject<T>;
};

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

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The loop populates this fresh recursive accumulator by dynamic key; its initial empty literal does not describe the returned structure.
  return result;
};

const collectBranchLeaves = <T>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  path: string[] = [],
): { path: string[]; values: Record<string, T> }[] => {
  const leaves = Record.filter(obj, leafRefinement);
  const hasLeaves = Record.keys(leaves).length > 0;

  const currentBranch = hasLeaves ? [{ path, values: leaves }] : [];

  const nestedBranches = Array.flatMap(Record.keys(obj), (key) => {
    const value = obj[key];

    if (
      !leafRefinement(value) &&
      (Predicate.isObjectOrArray(value) || value === null)
    ) {
      return collectBranchLeaves(value, leafRefinement, [...path, key]);
    }

    return [];
  });

  return [...currentBranch, ...nestedBranches];
};

export const forEachBranchLeaves = <T, A, E, R>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  f: (branchLeaves: {
    path: string[];
    values: Record<string, T>;
  }) => Effect.Effect<A, E, R>,
): Effect.Effect<void, E, R> => {
  const branchLeaves = collectBranchLeaves(obj, leafRefinement);

  return Effect.forEach(branchLeaves, f, {
    discard: true,
  });
};

export const setNestedProperty = <T extends object>(
  obj: T,
  path: PropertyKey[],
  value: any,
): T => {
  if (path.length === 0) {
    return obj;
  }

  if (path.length === 1) {
    const key = path[0];

    return { ...obj, [key]: value };
  }

  const [head, ...tail] = path;
  const key = head;

  return {
    ...obj,
    // SAFETY: The setter accepts arbitrary property paths, including missing keys; dynamic reads preserve the existing child or use an empty branch for a nullish child.
    [key]: setNestedProperty((obj as any)[key] ?? {}, tail, value),
  };
};
