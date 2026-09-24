import { GroupSpec, Spec } from "@confect/core";
import $group$14_databaseReader from "../databaseReader.spec";
import $group$15_typedErrorsNode from "../typedErrorsNode.spec";
import $group$6_groups$10_middleware from "../groups/middleware.spec";
import $group$6_groups$10_scheduling from "../groups/scheduling.spec";
import $group$6_groups$11_cjsImporter from "../groups/cjsImporter.spec";
import $group$6_groups$11_typedErrors from "../groups/typedErrors.spec";
import $group$6_groups$13_aliasImporter from "../groups/aliasImporter.spec";
import $group$6_groups$15_middlewareOrder from "../groups/middlewareOrder.spec";
import $group$6_groups$17_middlewareHelpers from "../groups/middlewareHelpers.spec";
import $group$6_groups$17_middlewareOptions from "../groups/middlewareOptions.spec";
import $group$6_groups$5_notes from "../groups/notes.spec";
import $group$6_groups$6_random from "../groups/random.spec";
import $group$6_groups$6_random$5_stats from "../groups/random/stats.spec";
import $group$6_groups$7_runners from "../groups/runners.spec";

const spec: Spec.Spec<{
  readonly databaseReader: GroupSpec.NamedAt<typeof $group$14_databaseReader, "databaseReader">;
  readonly groups: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof $group$6_groups$13_aliasImporter, "aliasImporter"> | GroupSpec.NamedAt<typeof $group$6_groups$11_cjsImporter, "cjsImporter"> | GroupSpec.NamedAt<typeof $group$6_groups$10_middleware, "middleware"> | GroupSpec.NamedAt<typeof $group$6_groups$17_middlewareHelpers, "middlewareHelpers"> | GroupSpec.NamedAt<typeof $group$6_groups$17_middlewareOptions, "middlewareOptions"> | GroupSpec.NamedAt<typeof $group$6_groups$15_middlewareOrder, "middlewareOrder"> | GroupSpec.NamedAt<typeof $group$6_groups$5_notes, "notes"> | GroupSpec.NamedAt<GroupSpec.AddGroups<typeof $group$6_groups$6_random, GroupSpec.NamedAt<typeof $group$6_groups$6_random$5_stats, "stats">>, "random"> | GroupSpec.NamedAt<typeof $group$6_groups$7_runners, "runners"> | GroupSpec.NamedAt<typeof $group$6_groups$10_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof $group$6_groups$11_typedErrors, "typedErrors">>, "groups">;
  readonly typedErrorsNode: GroupSpec.NamedAt<typeof $group$15_typedErrorsNode, "typedErrorsNode">;
}> = Spec.make().addAt("databaseReader", $group$14_databaseReader).addAt("groups", GroupSpec.makeAt("groups").addGroupAt("aliasImporter", $group$6_groups$13_aliasImporter).addGroupAt("cjsImporter", $group$6_groups$11_cjsImporter).addGroupAt("middleware", $group$6_groups$10_middleware).addGroupAt("middlewareHelpers", $group$6_groups$17_middlewareHelpers).addGroupAt("middlewareOptions", $group$6_groups$17_middlewareOptions).addGroupAt("middlewareOrder", $group$6_groups$15_middlewareOrder).addGroupAt("notes", $group$6_groups$5_notes).addGroupAt("random", $group$6_groups$6_random.addGroupAt("stats", $group$6_groups$6_random$5_stats)).addGroupAt("runners", $group$6_groups$7_runners).addGroupAt("scheduling", $group$6_groups$10_scheduling).addGroupAt("typedErrors", $group$6_groups$11_typedErrors)).addAt("typedErrorsNode", $group$15_typedErrorsNode);

export default spec;
