import type * as DatabaseSchema from "./DatabaseSchema";
import * as Core from "./RegisteredConvexFunctionCore";
import type * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";
import * as SchemaToValidator from "./SchemaToValidator";

const compilers: RegisteredFunction.Compilers = {
  compileArgs: SchemaToValidator.compileArgsSchema,
  compileReturns: SchemaToValidator.compileReturnsSchema,
};

/**
 * The default builder for Convex (non-Node) functions: registers each function
 * with Convex `args`/`returns` validators compiled from its `Schema`. Importing
 * this module pulls `SchemaToValidator` into the function's startup import graph
 * and compiles validators at registration. The validator-free counterpart
 * (`RegisteredConvexFunctionWithoutValidators`) skips both; codegen selects
 * between them via the build-time skip-validators flag.
 */
export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  registryItem: RegistryItem.AnyWithProps,
): RegisteredFunction.Any => Core.make(databaseSchema, registryItem, compilers);

// Re-exported for internal consumers (shared by the mutation builders).
export {
  mutationLayer,
  type MutationServices,
} from "./RegisteredConvexFunctionCore";
