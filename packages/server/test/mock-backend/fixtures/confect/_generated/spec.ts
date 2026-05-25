import { GroupSpec, Spec } from "@confect/core";
import databaseReader from "../databaseReader.spec";
import notes from "../groups/notes.spec";
import random from "../groups/random.spec";
import runners from "../groups/runners.spec";
import typedErrors from "../groups/typedErrors.spec";

export default Spec.make().addAt("databaseReader", databaseReader).addAt("groups", GroupSpec.makeAt("groups").addGroupAt("notes", notes).addGroupAt("random", random).addGroupAt("runners", runners).addGroupAt("typedErrors", typedErrors));
