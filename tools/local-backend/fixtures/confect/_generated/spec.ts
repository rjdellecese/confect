import { GroupSpec as Group, Spec } from "@confect/core";
import clientsSpec from "../clients.spec";
import groups_authenticationSpec from "../groups/authentication.spec";
import groups_cacheControlSpec from "../groups/cacheControl.spec";
import groups_cacheStubbedSpec from "../groups/cacheStubbed.spec";
import groups_contextReuseSpec from "../groups/contextReuse.spec";
import groups_documentIdsSpec from "../groups/documentIds.spec";
import groups_httpVectorsSpec from "../groups/httpVectors.spec";
import groups_metadataSpec from "../groups/metadata.spec";
import groups_schedulingSpec from "../groups/scheduling.spec";
import groups_storageSpec from "../groups/storage.spec";
import groups_transactionsSpec from "../groups/transactions.spec";
import metadataNodeSpec from "../metadataNode.spec";

const spec: Spec.Spec<{
  readonly clients: Group.NamedAt<typeof clientsSpec, "clients">;
  readonly groups: Group.NamedAt<Group.GroupSpec<"Convex", "groups", never, Group.NamedAt<typeof groups_authenticationSpec, "authentication"> | Group.NamedAt<typeof groups_cacheControlSpec, "cacheControl"> | Group.NamedAt<typeof groups_cacheStubbedSpec, "cacheStubbed"> | Group.NamedAt<typeof groups_contextReuseSpec, "contextReuse"> | Group.NamedAt<typeof groups_documentIdsSpec, "documentIds"> | Group.NamedAt<typeof groups_httpVectorsSpec, "httpVectors"> | Group.NamedAt<typeof groups_metadataSpec, "metadata"> | Group.NamedAt<typeof groups_schedulingSpec, "scheduling"> | Group.NamedAt<typeof groups_storageSpec, "storage"> | Group.NamedAt<typeof groups_transactionsSpec, "transactions">>, "groups">;
  readonly metadataNode: Group.NamedAt<typeof metadataNodeSpec, "metadataNode">;
}> = Spec.fromGroups({
  ["clients"]: clientsSpec,
  ["groups"]: Group.addGroupsAt(Group.make(), {
    ["authentication"]: groups_authenticationSpec,
    ["cacheControl"]: groups_cacheControlSpec,
    ["cacheStubbed"]: groups_cacheStubbedSpec,
    ["contextReuse"]: groups_contextReuseSpec,
    ["documentIds"]: groups_documentIdsSpec,
    ["httpVectors"]: groups_httpVectorsSpec,
    ["metadata"]: groups_metadataSpec,
    ["scheduling"]: groups_schedulingSpec,
    ["storage"]: groups_storageSpec,
    ["transactions"]: groups_transactionsSpec,
  }),
  ["metadataNode"]: metadataNodeSpec,
}) as typeof spec;

export default spec;
