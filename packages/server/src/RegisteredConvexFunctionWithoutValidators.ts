import type * as DatabaseSchema from "./DatabaseSchema";
import * as Core from "./RegisteredConvexFunctionCore";
import type * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";

/**
 * Validator-free builder for Convex (non-Node) functions. Registers each
 * function with only a `handler` — no Convex `args`/`returns` validators — so it
 * never imports `SchemaToValidator` and never compiles validators at
 * registration, trimming per-function cold-start startup time. Confect's own
 * `Schema.decode`/`Schema.encode` inside the handler still enforce correctness;
 * what is lost is Convex's boundary arg-validation and the function's
 * args/returns metadata in the deployed spec / `api.d.ts`.
 *
 * Codegen emits a registry that imports this builder (instead of
 * `RegisteredConvexFunction`) when the build-time skip-validators flag is set.
 */
export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  registryItem: RegistryItem.AnyWithProps,
): RegisteredFunction.Any => Core.make(databaseSchema, registryItem);
