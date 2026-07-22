import { GroupSpec, Spec } from "@confect/core";
import databaseReader from "../databaseReader.spec";
import groups_aliasImporter from "../groups/aliasImporter.spec";
import groups_cjsImporter from "../groups/cjsImporter.spec";
import groups_notes from "../groups/notes.spec";
import groups_random from "../groups/random.spec";
import groups_random_stats from "../groups/random/stats.spec";
import groups_runners from "../groups/runners.spec";
import groups_scheduling from "../groups/scheduling.spec";
import groups_typedErrors from "../groups/typedErrors.spec";
import typedErrorsNode from "../typedErrorsNode.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<typeof databaseReader, "databaseReader">
  | GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "groups", never, GroupSpec.NamedAt<typeof groups_aliasImporter, "aliasImporter"> | GroupSpec.NamedAt<typeof groups_cjsImporter, "cjsImporter"> | GroupSpec.NamedAt<typeof groups_notes, "notes"> | GroupSpec.NamedAt<GroupSpec.AddGroups<typeof groups_random, GroupSpec.NamedAt<typeof groups_random_stats, "stats">>, "random"> | GroupSpec.NamedAt<typeof groups_runners, "runners"> | GroupSpec.NamedAt<typeof groups_scheduling, "scheduling"> | GroupSpec.NamedAt<typeof groups_typedErrors, "typedErrors">>, "groups">
  | GroupSpec.NamedAt<typeof typedErrorsNode, "typedErrorsNode">
> = Spec.make().addAt("databaseReader", databaseReader).addAt("groups", GroupSpec.makeAt("groups").addGroupAt("aliasImporter", groups_aliasImporter).addGroupAt("cjsImporter", groups_cjsImporter).addGroupAt("notes", groups_notes).addGroupAt("random", groups_random.addGroupAt("stats", groups_random_stats)).addGroupAt("runners", groups_runners).addGroupAt("scheduling", groups_scheduling).addGroupAt("typedErrors", groups_typedErrors)).addAt("typedErrorsNode", typedErrorsNode);

export default spec;
