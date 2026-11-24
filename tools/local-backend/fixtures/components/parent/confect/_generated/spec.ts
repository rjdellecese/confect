import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
import parentSpec from "../parent.spec";

/**
 * Function contract for the component, assembled from its group specs. Use it
 * to inspect the complete function tree without loading handler implementations
 * or evaluating the functions' schema factories.
 *
 * @category models
 */
const spec: Spec.Spec<{
  readonly parent: GroupSpec_.NamedAt<typeof parentSpec, "parent">;
}> = Spec.fromGroups({
  ["parent"]: parentSpec,
}) as typeof spec;

export default spec;
