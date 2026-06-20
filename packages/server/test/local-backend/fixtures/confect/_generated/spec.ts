import { GroupSpec, Spec } from "@confect/core";
import groups_cacheControl from "../groups/cacheControl.spec";
import groups_cacheStubbed from "../groups/cacheStubbed.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_cacheControl, "cacheControl"> | GroupSpec.NamedAt<typeof groups_cacheStubbed, "cacheStubbed">>, "groups">
> = Spec.make().addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", groups_cacheControl).addGroupAt("cacheStubbed", groups_cacheStubbed));

export default spec;
