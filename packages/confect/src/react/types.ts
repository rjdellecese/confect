// Shared type utilities for Confect React hooks

// Error types will be provided via declaration merging from generated files
// Each app should import their own generated types (e.g., /// <reference types="@monorepo/backend/confect-types" />)
export interface ConfectErrorTypes {}

// Helper type to create namespaced function key
export type CreateNamespacedKey<
  M extends string,
  F extends string,
> = `${M}.${F}`;

// Extract error types from ConfectErrorTypes interface (declaration merging)
// Now only supports namespaced keys (M.F format)
export type InferFunctionErrors<F extends string> =
  F extends keyof ConfectErrorTypes ? ConfectErrorTypes[F] : any;

// Module-aware error inference - creates the namespaced key and infers errors
export type InferModuleFunctionErrors<M extends string, F extends string> =
  CreateNamespacedKey<M, F> extends keyof ConfectErrorTypes
    ? ConfectErrorTypes[CreateNamespacedKey<M, F>]
    : any;

// Helper types for direct inference from Convex API functions
export type InferFunctionArgs<T> = T extends { _args: infer Args } ? Args : any;
export type InferFunctionReturns<T> = T extends { _returnType: infer Return }
  ? Return
  : any;
