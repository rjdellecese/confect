import { GroupSpec, Spec } from "@confect/core";
import groups_cacheControl from "../groups/cacheControl.spec";
import groups_cacheStubbed from "../groups/cacheStubbed.spec";
import groups_metadata from "../groups/metadata.spec";
import groups_scheduling from "../groups/scheduling.spec";
import groups_storage from "../groups/storage.spec";
import metadataNode from "../metadataNode.spec";

const spec: Spec.Spec<{
  readonly groups: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_cacheControl, "cacheControl"> | GroupSpec.NamedAt<typeof groups_cacheStubbed, "cacheStubbed"> | GroupSpec.NamedAt<typeof groups_metadata, "metadata"> | GroupSpec.NamedAt<typeof groups_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof groups_storage, "storage">>, "groups">;
  readonly metadataNode: GroupSpec.NamedAt<typeof metadataNode, "metadataNode">;
}> = Spec.make().addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", groups_cacheControl).addGroupAt("cacheStubbed", groups_cacheStubbed).addGroupAt("metadata", groups_metadata).addGroupAt("scheduling", groups_scheduling).addGroupAt("storage", groups_storage)).addAt("metadataNode", metadataNode);

export default spec;
