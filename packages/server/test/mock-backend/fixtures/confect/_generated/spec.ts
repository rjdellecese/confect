import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
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
  readonly databaseReader: GroupSpec_.NamedAt<typeof databaseReaderSpec, "databaseReader">;
  readonly groups: GroupSpec_.NamedAt<GroupSpec_.GroupSpec<"Convex", "groups", never, GroupSpec_.NamedAt<typeof groups_aliasImporterSpec, "aliasImporter"> | GroupSpec_.NamedAt<typeof groups_cjsImporterSpec, "cjsImporter"> | GroupSpec_.NamedAt<typeof groups_middlewareSpec, "middleware"> | GroupSpec_.NamedAt<typeof groups_middlewareHelpersSpec, "middlewareHelpers"> | GroupSpec_.NamedAt<typeof groups_middlewareOptionsSpec, "middlewareOptions"> | GroupSpec_.NamedAt<typeof groups_middlewareOrderSpec, "middlewareOrder"> | GroupSpec_.NamedAt<typeof groups_notesSpec, "notes"> | GroupSpec_.NamedAt<GroupSpec_.AddGroups<typeof groups_randomSpec, GroupSpec_.NamedAt<typeof groups_random_statsSpec, "stats">>, "random"> | GroupSpec_.NamedAt<typeof groups_runnersSpec, "runners"> | GroupSpec_.NamedAt<typeof groups_schedulingSpec, "scheduling"> | GroupSpec_.NamedAt<typeof groups_typedErrorsSpec, "typedErrors">>, "groups">;
  readonly typedErrorsNode: GroupSpec_.NamedAt<typeof typedErrorsNodeSpec, "typedErrorsNode">;
}> = Spec.fromGroups({
  ["databaseReader"]: databaseReaderSpec,
  ["groups"]: GroupSpec_.addGroupsAt(GroupSpec_.make(), {
    ["aliasImporter"]: groups_aliasImporterSpec,
    ["cjsImporter"]: groups_cjsImporterSpec,
    ["middleware"]: groups_middlewareSpec,
    ["middlewareHelpers"]: groups_middlewareHelpersSpec,
    ["middlewareOptions"]: groups_middlewareOptionsSpec,
    ["middlewareOrder"]: groups_middlewareOrderSpec,
    ["notes"]: groups_notesSpec,
    ["random"]: GroupSpec_.addGroupsAt(groups_randomSpec, {
      ["stats"]: groups_random_statsSpec,
    }),
    ["runners"]: groups_runnersSpec,
    ["scheduling"]: groups_schedulingSpec,
    ["typedErrors"]: groups_typedErrorsSpec,
  }),
  ["typedErrorsNode"]: typedErrorsNodeSpec,
}) as typeof spec;

export default spec;
