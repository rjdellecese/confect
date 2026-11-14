import { GroupSpec, Spec } from "@confect/core";
import parent from "../parent.spec";

const spec: Spec.Spec<{
  readonly parent: GroupSpec.NamedAt<typeof parent, "parent">;
}> = Spec.fromGroups({
  ["parent"]: parent,
}) as typeof spec;

export default spec;
