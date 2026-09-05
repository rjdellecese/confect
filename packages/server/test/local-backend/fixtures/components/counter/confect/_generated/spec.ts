import { GroupSpec, Spec } from "@confect/core";
import counter from "../counter.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<typeof counter, "counter">
> = Spec.make().addAt("counter", counter);

export default spec;
