import { GroupSpec, Spec } from "@confect/core";
import env from "../env.spec";
import notes from "../notesAndRandom/notes.spec";
import random from "../notesAndRandom/random.spec";
import workpool from "../workpool.spec";

export default Spec.make().addAt("env", env).addAt("notesAndRandom", GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", notes).addGroupAt("random", random)).addAt("workpool", workpool);
