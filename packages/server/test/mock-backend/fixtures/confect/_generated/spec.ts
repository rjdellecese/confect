import { GroupSpec, Spec } from "@confect/core";
import databaseReader from "../databaseReader.spec";
import groups_aliasImporter from "../groups/aliasImporter.spec";
import groups_cjsImporter from "../groups/cjsImporter.spec";
import groups_middleware from "../groups/middleware.spec";
import groups_middlewareHelpers from "../groups/middlewareHelpers.spec";
import groups_middlewareOptions from "../groups/middlewareOptions.spec";
import groups_middlewareOrder from "../groups/middlewareOrder.spec";
import groups_notes from "../groups/notes.spec";
import groups_random from "../groups/random.spec";
import groups_random_stats from "../groups/random/stats.spec";
import groups_runners from "../groups/runners.spec";
import groups_scheduling from "../groups/scheduling.spec";
import groups_typedErrors from "../groups/typedErrors.spec";
import typedErrorsNode from "../typedErrorsNode.spec";

const spec: Spec.Spec<{
  readonly databaseReader: GroupSpec.NamedAt<typeof databaseReader, "databaseReader">;
  readonly groups: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_aliasImporter, "aliasImporter"> | GroupSpec.NamedAt<typeof groups_cjsImporter, "cjsImporter"> | GroupSpec.NamedAt<typeof groups_middleware, "middleware"> | GroupSpec.NamedAt<typeof groups_middlewareHelpers, "middlewareHelpers"> | GroupSpec.NamedAt<typeof groups_middlewareOptions, "middlewareOptions"> | GroupSpec.NamedAt<typeof groups_middlewareOrder, "middlewareOrder"> | GroupSpec.NamedAt<typeof groups_notes, "notes"> | GroupSpec.NamedAt<GroupSpec.AddGroups<typeof groups_random, GroupSpec.NamedAt<typeof groups_random_stats, "stats">>, "random"> | GroupSpec.NamedAt<typeof groups_runners, "runners"> | GroupSpec.NamedAt<typeof groups_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof groups_typedErrors, "typedErrors">>, "groups">;
  readonly typedErrorsNode: GroupSpec.NamedAt<typeof typedErrorsNode, "typedErrorsNode">;
}> = (Spec.make() as any).addAt("databaseReader", (databaseReader as any)).addAt("groups", (GroupSpec.makeAt("groups") as any).addGroupAt("aliasImporter", (groups_aliasImporter as any)).addGroupAt("cjsImporter", (groups_cjsImporter as any)).addGroupAt("middleware", (groups_middleware as any)).addGroupAt("middlewareHelpers", (groups_middlewareHelpers as any)).addGroupAt("middlewareOptions", (groups_middlewareOptions as any)).addGroupAt("middlewareOrder", (groups_middlewareOrder as any)).addGroupAt("notes", (groups_notes as any)).addGroupAt("random", (groups_random as any).addGroupAt("stats", (groups_random_stats as any))).addGroupAt("runners", (groups_runners as any)).addGroupAt("scheduling", (groups_scheduling as any)).addGroupAt("typedErrors", (groups_typedErrors as any))).addAt("typedErrorsNode", (typedErrorsNode as any));

export default spec;
