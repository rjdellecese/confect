import { GroupSpec, Spec } from "@confect/core";
import databaseReader from "../databaseReader.spec";
import groups_cjsImporter from "../groups/cjsImporter.spec";
import groups_notes from "../groups/notes.spec";
import groups_random from "../groups/random.spec";
import groups_runners from "../groups/runners.spec";
import groups_typedErrors from "../groups/typedErrors.spec";

export default Spec.make().addPath(databaseReader, "databaseReader").addPath(groups_cjsImporter, "groups.cjsImporter").addPath(groups_notes, "groups.notes").addPath(groups_random, "groups.random").addPath(groups_runners, "groups.runners").addPath(groups_typedErrors, "groups.typedErrors").addAt("databaseReader", databaseReader).addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cjsImporter", groups_cjsImporter).addGroupAt("notes", groups_notes).addGroupAt("random", groups_random).addGroupAt("runners", groups_runners).addGroupAt("typedErrors", groups_typedErrors));
