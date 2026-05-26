import { GroupSpec, Spec } from "@confect/core";
import env from "../env.spec";
import notesAndRandom_notes from "../notesAndRandom/notes.spec";
import notesAndRandom_random from "../notesAndRandom/random.spec";
import workpool from "../workpool.spec";

export default Spec.make().addPath(env, "env").addPath(notesAndRandom_notes, "notesAndRandom.notes").addPath(notesAndRandom_random, "notesAndRandom.random").addPath(workpool, "workpool").addAt("env", env).addAt("notesAndRandom", GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", notesAndRandom_notes).addGroupAt("random", notesAndRandom_random)).addAt("workpool", workpool);
