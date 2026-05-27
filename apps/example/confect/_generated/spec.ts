import { GroupSpec, Spec } from "@confect/core";
import env from "../env.spec";
import notes_and_random_notes from "../notes_and_random/notes.spec";
import notes_and_random_random from "../notes_and_random/random.spec";
import workpool from "../workpool.spec";

export default Spec.make().addPath(env, "env").addPath(notes_and_random_notes, "notes_and_random.notes").addPath(notes_and_random_random, "notes_and_random.random").addPath(workpool, "workpool").addAt("env", env).addAt("notes_and_random", GroupSpec.makeAt("notes_and_random").addGroupAt("notes", notes_and_random_notes).addGroupAt("random", notes_and_random_random)).addAt("workpool", workpool);
