import { GroupSpec, Spec } from "@confect/core";
import email from "../email.spec";
import env from "../env.spec";
import notes_and_random_notes from "../notes_and_random/notes.spec";
import notes_and_random_random from "../notes_and_random/random.spec";
import workpool from "../workpool.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<typeof email, "email">
  | GroupSpec.NamedAt<typeof env, "env">
  | GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "notes_and_random", never, GroupSpec.NamedAt<typeof notes_and_random_notes, "notes"> | GroupSpec.NamedAt<typeof notes_and_random_random, "random">>, "notes_and_random">
  | GroupSpec.NamedAt<typeof workpool, "workpool">
> = Spec.make().addAt("email", email).addAt("env", env).addAt("notes_and_random", GroupSpec.makeAt("notes_and_random").addGroupAt("notes", notes_and_random_notes).addGroupAt("random", notes_and_random_random)).addAt("workpool", workpool);

export default spec;
