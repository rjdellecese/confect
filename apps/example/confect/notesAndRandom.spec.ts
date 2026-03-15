import { GroupSpec } from "@confect/core";
import { notes } from "./notesAndRandom/notes.spec";
import { random } from "./notesAndRandom/random.spec";

export const notesAndRandom = GroupSpec.make("notesAndRandom")
  .addGroup(notes)
  .addGroup(random);
