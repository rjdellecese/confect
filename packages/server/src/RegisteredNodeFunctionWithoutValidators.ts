import type * as DatabaseSchema from "./DatabaseSchema";
import * as Core from "./RegisteredNodeFunctionCore";
import type * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";

/**
 * Validator-free builder for Node-runtime actions. Registers each action with
 * only a `handler` — no Convex `args`/`returns` validators — so it never imports
 * `SchemaToValidator` and never compiles validators at registration. Confect's
 * own `Schema.decode`/`Schema.encode` inside the handler still enforce
 * correctness. Codegen emits a registry that imports this builder (instead of
 * `RegisteredNodeFunction`) when the build-time skip-validators flag is set.
 */
export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  registryItem: RegistryItem.AnyWithProps,
): RegisteredFunction.Any => Core.make(databaseSchema, registryItem);
