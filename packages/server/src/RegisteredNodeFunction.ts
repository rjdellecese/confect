import type * as DatabaseSchema from "./DatabaseSchema";
import * as Core from "./RegisteredNodeFunctionCore";
import type * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";
import * as SchemaToValidator from "./SchemaToValidator";

const compilers: RegisteredFunction.Compilers = {
  compileArgs: SchemaToValidator.compileArgsSchema,
  compileReturns: SchemaToValidator.compileReturnsSchema,
};

/**
 * The default builder for Node-runtime actions: registers each action with
 * Convex `args`/`returns` validators compiled from its `Schema`. The
 * validator-free counterpart (`RegisteredNodeFunctionWithoutValidators`) skips
 * compilation; codegen selects between them via the build-time skip-validators
 * flag.
 */
export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  registryItem: RegistryItem.AnyWithProps,
): RegisteredFunction.Any => Core.make(databaseSchema, registryItem, compilers);
