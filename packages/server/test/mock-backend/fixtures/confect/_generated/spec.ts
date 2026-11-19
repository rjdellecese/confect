import { GroupSpec as Group, Spec } from "@confect/core";
import databaseReaderSpec from "../databaseReader.spec";
import groups_aliasImporterSpec from "../groups/aliasImporter.spec";
import groups_cjsImporterSpec from "../groups/cjsImporter.spec";
import groups_middlewareHelpersSpec from "../groups/middlewareHelpers.spec";
import groups_middlewareOptionsSpec from "../groups/middlewareOptions.spec";
import groups_middlewareOrderSpec from "../groups/middlewareOrder.spec";
import groups_middlewareSpec from "../groups/middleware.spec";
import groups_notesSpec from "../groups/notes.spec";
import groups_randomSpec from "../groups/random.spec";
import groups_random_statsSpec from "../groups/random/stats.spec";
import groups_runnersSpec from "../groups/runners.spec";
import groups_schedulingSpec from "../groups/scheduling.spec";
import groups_typedErrorsSpec from "../groups/typedErrors.spec";
import typedErrorsNodeSpec from "../typedErrorsNode.spec";

const spec: Spec.Spec<{
  readonly databaseReader: Group.NamedAt<typeof databaseReaderSpec, "databaseReader">;
  readonly groups: Group.NamedAt<Group.GroupSpec<"Convex", "groups", never, Group.NamedAt<typeof groups_aliasImporterSpec, "aliasImporter"> | Group.NamedAt<typeof groups_cjsImporterSpec, "cjsImporter"> | Group.NamedAt<typeof groups_middlewareSpec, "middleware"> | Group.NamedAt<typeof groups_middlewareHelpersSpec, "middlewareHelpers"> | Group.NamedAt<typeof groups_middlewareOptionsSpec, "middlewareOptions"> | Group.NamedAt<typeof groups_middlewareOrderSpec, "middlewareOrder"> | Group.NamedAt<typeof groups_notesSpec, "notes"> | Group.NamedAt<Group.AddGroups<typeof groups_randomSpec, Group.NamedAt<typeof groups_random_statsSpec, "stats">>, "random"> | Group.NamedAt<typeof groups_runnersSpec, "runners"> | Group.NamedAt<typeof groups_schedulingSpec, "scheduling"> | Group.NamedAt<typeof groups_typedErrorsSpec, "typedErrors">>, "groups">;
  readonly typedErrorsNode: Group.NamedAt<typeof typedErrorsNodeSpec, "typedErrorsNode">;
}> = Spec.fromGroups({
  ["databaseReader"]: databaseReaderSpec,
  ["groups"]: Group.addGroupsAt(Group.make(), {
    ["aliasImporter"]: groups_aliasImporterSpec,
    ["cjsImporter"]: groups_cjsImporterSpec,
    ["middleware"]: groups_middlewareSpec,
    ["middlewareHelpers"]: groups_middlewareHelpersSpec,
    ["middlewareOptions"]: groups_middlewareOptionsSpec,
    ["middlewareOrder"]: groups_middlewareOrderSpec,
    ["notes"]: groups_notesSpec,
    ["random"]: Group.addGroupsAt(groups_randomSpec, {
      ["stats"]: groups_random_statsSpec,
    }),
    ["runners"]: groups_runnersSpec,
    ["scheduling"]: groups_schedulingSpec,
    ["typedErrors"]: groups_typedErrorsSpec,
  }),
  ["typedErrorsNode"]: typedErrorsNodeSpec,
}) as typeof spec;

export default spec;
