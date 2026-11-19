import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
import counterSpec from "../counter.spec";

const spec: Spec.Spec<{
  readonly counter: GroupSpec_.NamedAt<typeof counterSpec, "counter">;
}> = Spec.fromGroups({
  ["counter"]: counterSpec,
}) as typeof spec;

export default spec;
