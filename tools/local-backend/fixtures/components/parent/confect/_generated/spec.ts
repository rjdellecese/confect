import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
import parentSpec from "../parent.spec";

const spec: Spec.Spec<{
  readonly parent: GroupSpec_.NamedAt<typeof parentSpec, "parent">;
}> = Spec.fromGroups({
  ["parent"]: parentSpec,
}) as typeof spec;

export default spec;
