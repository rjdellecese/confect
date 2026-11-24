import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
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

/**
 * Function contract for the application, assembled from its group specs. Use it
 * to inspect the complete function tree without loading handler implementations
 * or evaluating the functions' schema factories.
 *
 * @category models
 */
const spec: Spec.Spec<{
  readonly clients: GroupSpec_.NamedAt<typeof clientsSpec, "clients">;
  readonly groups: GroupSpec_.NamedAt<GroupSpec_.GroupSpec<"Convex", "groups", never, GroupSpec_.NamedAt<typeof groups_authenticationSpec, "authentication"> | GroupSpec_.NamedAt<typeof groups_cacheControlSpec, "cacheControl"> | GroupSpec_.NamedAt<typeof groups_cacheStubbedSpec, "cacheStubbed"> | GroupSpec_.NamedAt<typeof groups_contextReuseSpec, "contextReuse"> | GroupSpec_.NamedAt<typeof groups_documentIdsSpec, "documentIds"> | GroupSpec_.NamedAt<typeof groups_httpVectorsSpec, "httpVectors"> | GroupSpec_.NamedAt<typeof groups_metadataSpec, "metadata"> | GroupSpec_.NamedAt<typeof groups_schedulingSpec, "scheduling"> | GroupSpec_.NamedAt<typeof groups_storageSpec, "storage"> | GroupSpec_.NamedAt<typeof groups_transactionsSpec, "transactions">>, "groups">;
  readonly metadataNode: GroupSpec_.NamedAt<typeof metadataNodeSpec, "metadataNode">;
}> = Spec.fromGroups({
  ["clients"]: clientsSpec,
  ["groups"]: GroupSpec_.addGroupsAt(GroupSpec_.make(), {
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
