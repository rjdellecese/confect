import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
import counterSpec from "../counter.spec";

/**
 * Function contract for the component, assembled from its group specs. Use it
 * to inspect the complete function tree without loading handler implementations
 * or evaluating the functions' schema factories.
 *
 * @category models
 */
const spec: Spec.Spec<{
  readonly counter: GroupSpec_.NamedAt<typeof counterSpec, "counter">;
}> = Spec.fromGroups({
  ["counter"]: counterSpec,
}) as typeof spec;

export default spec;
