import { Effect, Predicate } from "effect";

//#region src/internal/utils.d.ts
declare const validateJsIdentifier: (identifier: string) => void;
type NestedObject<T> = {
  [key: string]: T | NestedObject<T>;
};
declare const mapLeaves: <T, U>(obj: NestedObject<T>, leafRefinement: Predicate.Refinement<unknown, T>, f: (value: T) => U) => NestedObject<U>;
declare const forEachBranchLeaves: <T, A, E, R>(obj: NestedObject<T>, leafRefinement: Predicate.Refinement<unknown, T>, f: (branchLeaves: {
  path: string[];
  values: Record<string, T>;
}) => Effect.Effect<A, E, R>) => Effect.Effect<void, E, R>;
declare const setNestedProperty: <T extends object>(obj: T, path: PropertyKey[], value: any) => T;
//#endregion
export { forEachBranchLeaves, mapLeaves, setNestedProperty, validateJsIdentifier };
//# sourceMappingURL=utils.d.ts.map