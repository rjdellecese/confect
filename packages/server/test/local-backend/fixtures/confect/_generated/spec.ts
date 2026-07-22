import { GroupSpec, Spec } from "@confect/core";
import groups_cacheControl from "../groups/cacheControl.spec";
import groups_cacheStubbed from "../groups/cacheStubbed.spec";
import groups_scheduling from "../groups/scheduling.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_cacheControl, "cacheControl"> | GroupSpec.NamedAt<typeof groups_cacheStubbed, "cacheStubbed"> | GroupSpec.NamedAt<typeof groups_scheduling, "scheduling">>, "groups">
> = Spec.make().addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", groups_cacheControl).addGroupAt("cacheStubbed", groups_cacheStubbed).addGroupAt("scheduling", groups_scheduling));

export default spec;
