/**
 * Builds deployment registrations. Implement handlers with `FunctionImpl.make`
 * from `confect/_generated/server` rather than importing this subpath.
 *
 * @module
 *
 * @internal
 */

import type * as DatabaseSchema from "./DatabaseSchema";
import * as ConvexFunctionDefinitions from "./ConvexFunctionDefinitions";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import type { Layer, Types } from "effect";
import type * as GroupImpl from "./GroupImpl";
import type * as RegisteredFunction from "./RegisteredFunction";

/**
 * @internal
 */
export type RegisteredFunctions<Spec_ extends Spec.AnyWithProps> =
  Types.Simplify<RegisteredFunctionsHelper<Spec.Groups<Spec_>>>;

type RegisteredFunctionsHelper<Groups extends GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? RegisteredFunctionsForGroupSpec<Group>
    : never;
};

/**
 * The `RegisteredFunction` record for a group's own declared functions.
 */
type RegisteredFunctionsOf<Group extends GroupSpec.AnyWithProps> = {
  [
    FunctionName in FunctionSpec.Name<GroupSpec.Functions<Group>>
  ]: FunctionSpec.WithName<
    GroupSpec.Functions<Group>,
    FunctionName
  > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
    ? RegisteredFunction.RegisteredFunction<FunctionSpec_>
    : never;
};

/**
 * Types one group's generated deployment exports from its leaf spec, without
 * depending on the project-wide contract. For an application function, name the
 * reference instead: for example, `typeof refs.public.notes.list` with the
 * default import from `confect/_generated/refs`.
 *
 * @internal
 */
export type RegisteredFunctionsForGroupSpec<
  Group extends GroupSpec.AnyWithProps,
> =
  GroupSpec.Groups<Group> extends infer SubGroups extends GroupSpec.AnyWithProps
    ? Types.Simplify<
        RegisteredFunctionsHelper<SubGroups> & RegisteredFunctionsOf<Group>
      >
    : RegisteredFunctionsOf<Group>;

/**
 * @internal
 */
export interface AnyWithProps {
  readonly [key: string]: RegisteredFunction.Any | AnyWithProps;
}

/**
 * Build the registered Convex functions for a single group from its finalized
 * `GroupImpl` layer.
 *
 * The `groupLayer` parameter requires `GroupImpl<"Finalized">`, so impls that
 * were never piped through `GroupImpl.finalize` (and impls with unmet
 * `FunctionImpl` requirements, which cannot be finalized) are rejected at the
 * codegen boundary, not just deep inside Convex at runtime.
 *
 * The group layer is built with a fresh, isolated `Registry` (rather than the
 * globally-cached default `Context.Reference`), so each `FunctionImpl.make`
 * registers under its flat, single-segment function-name key without colliding
 * with any other group built in the same process—the built registry holds
 * exactly this group's functions at the top level.
 *
 * The table names power document ID identification in queries and mutations; no
 * table definitions are needed. The `Group` type parameter shapes the returned
 * record. Generated isolate modules instead prepare definitions with
 * `ConvexFunctionDefinitions.buildForGroup` and add local forwarding handlers
 * before shared registration. Node groups use
 * `RegisteredNodeFunction.buildForGroup` from the Node entry.
 *
 * Generated deployment modules register each group's handlers. In `.impl.ts`
 * use `FunctionImpl.make` and `GroupImpl.finalize` from
 * `confect/_generated/server` rather than registering functions directly.
 *
 * @internal
 */
export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  tableNames: ReadonlyArray<string>,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
  target?: DatabaseSchema.Target,
): RegisteredFunctionsForGroupSpec<Group> =>
  ConvexFunctionDefinitions.register<Group>(
    ConvexFunctionDefinitions.buildForGroup(tableNames, groupLayer, target),
  );
