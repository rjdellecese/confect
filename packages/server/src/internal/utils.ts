import type { Predicate } from "effect";
import { Array, Effect, Record } from "effect";

type NestedObject<T> = {
  [key: string]: T | NestedObject<T>;
};

export const mapLeaves = <T, U>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  f: (value: T) => U,
): NestedObject<U> => {
  const result: any = {};

  for (const key in obj) {
    const value = obj[key];

    if (leafRefinement(value)) {
      result[key] = f(value as T);
    } else {
      result[key] = mapLeaves(value as NestedObject<T>, leafRefinement, f);
    }
  }

  return result;
};

const collectBranchLeaves = <T>(
  obj: NestedObject<T>,
  leafRefinement: Predicate.Refinement<unknown, T>,
  path: string[] = [],
): { path: string[]; values: Record<string, T> }[] => {
  const leaves = Record.filter(obj, leafRefinement) as Record<string, T>;
  const hasLeaves = Record.keys(leaves).length > 0;

  const currentBranch = hasLeaves ? [{ path, values: leaves }] : [];

  const nestedBranches = Array.flatMap(Record.keys(obj), (key) => {
    const value = obj[key];

    if (!leafRefinement(value) && typeof value === "object") {
      return collectBranchLeaves(value as NestedObject<T>, leafRefinement, [
        ...path,
        key,
      ]);
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
    const key = path[0] as keyof T;
    return { ...obj, [key]: value };
  }

  const [head, ...tail] = path;
  const key = head as keyof T;
  return {
    ...obj,
    [key]: setNestedProperty((obj as any)[key] ?? {}, tail, value),
  };
};
