import { GroupSpec, Spec } from "@confect/core";
import databaseReader from "../databaseReader.spec";
import groups_notes from "../groups/notes.spec";
import groups_random from "../groups/random.spec";
import groups_runners from "../groups/runners.spec";
import groups_typedErrors from "../groups/typedErrors.spec";

export default Spec.make().addAt("databaseReader", databaseReader).addAt("groups", GroupSpec.makeAt("groups").addGroupAt("notes", groups_notes).addGroupAt("random", groups_random).addGroupAt("runners", groups_runners).addGroupAt("typedErrors", groups_typedErrors));
