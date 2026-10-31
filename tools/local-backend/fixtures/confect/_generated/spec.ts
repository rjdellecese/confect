import { GroupSpec, Spec } from "@confect/core";
import clients from "../clients.spec";
import groups_cacheControl from "../groups/cacheControl.spec";
import groups_cacheStubbed from "../groups/cacheStubbed.spec";
import groups_components from "../groups/components.spec";
import groups_documentIds from "../groups/documentIds.spec";
import groups_metadata from "../groups/metadata.spec";
import groups_nativeComponents from "../groups/nativeComponents.spec";
import groups_scheduling from "../groups/scheduling.spec";
import groups_storage from "../groups/storage.spec";
import groups_transactions from "../groups/transactions.spec";
import metadataNode from "../metadataNode.spec";

const spec: Spec.Spec<{
  readonly clients: GroupSpec.NamedAt<typeof clients, "clients">;
  readonly groups: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_cacheControl, "cacheControl"> | GroupSpec.NamedAt<typeof groups_cacheStubbed, "cacheStubbed"> | GroupSpec.NamedAt<typeof groups_components, "components"> | GroupSpec.NamedAt<typeof groups_documentIds, "documentIds"> | GroupSpec.NamedAt<typeof groups_metadata, "metadata"> | GroupSpec.NamedAt<typeof groups_nativeComponents, "nativeComponents"> | GroupSpec.NamedAt<typeof groups_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof groups_storage, "storage"> | GroupSpec.NamedAt<typeof groups_transactions, "transactions">>, "groups">;
  readonly metadataNode: GroupSpec.NamedAt<typeof metadataNode, "metadataNode">;
}> = Spec.fromGroups({
  ["clients"]: clients,
  ["groups"]: GroupSpec.addGroupsAt(GroupSpec.make(), {
    ["cacheControl"]: groups_cacheControl,
    ["cacheStubbed"]: groups_cacheStubbed,
    ["components"]: groups_components,
    ["documentIds"]: groups_documentIds,
    ["metadata"]: groups_metadata,
    ["nativeComponents"]: groups_nativeComponents,
    ["scheduling"]: groups_scheduling,
    ["storage"]: groups_storage,
    ["transactions"]: groups_transactions,
  }),
  ["metadataNode"]: metadataNode,
}) as typeof spec;

export default spec;
