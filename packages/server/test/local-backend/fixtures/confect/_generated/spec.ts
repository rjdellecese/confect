import { GroupSpec, Spec } from "@confect/core";
import $group$6_groups$10_scheduling from "../groups/scheduling.spec";
import $group$6_groups$12_cacheControl from "../groups/cacheControl.spec";
import $group$6_groups$12_cacheStubbed from "../groups/cacheStubbed.spec";
import $group$6_groups$7_storage from "../groups/storage.spec";

const spec: Spec.Spec<{
  readonly groups: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof $group$6_groups$12_cacheControl, "cacheControl"> | GroupSpec.NamedAt<typeof $group$6_groups$12_cacheStubbed, "cacheStubbed"> | GroupSpec.NamedAt<typeof $group$6_groups$10_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof $group$6_groups$7_storage, "storage">>, "groups">;
}> = Spec.make().addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", $group$6_groups$12_cacheControl).addGroupAt("cacheStubbed", $group$6_groups$12_cacheStubbed).addGroupAt("scheduling", $group$6_groups$10_scheduling).addGroupAt("storage", $group$6_groups$7_storage));

export default spec;
