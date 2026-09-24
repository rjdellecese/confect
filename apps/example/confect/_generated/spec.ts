import { GroupSpec, Spec } from "@confect/core";
import $group$16_notes_and_random$5_notes from "../notes_and_random/notes.spec";
import $group$16_notes_and_random$6_random from "../notes_and_random/random.spec";
import $group$3_env from "../env.spec";
import $group$5_email from "../email.spec";
import $group$5_users from "../users.spec";
import $group$6_viewer from "../viewer.spec";
import $group$8_workpool from "../workpool.spec";

const spec: Spec.Spec<{
  readonly email: GroupSpec.NamedAt<typeof $group$5_email, "email">;
  readonly env: GroupSpec.NamedAt<typeof $group$3_env, "env">;
  readonly notes_and_random: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "notes_and_random", never, GroupSpec.NamedAt<typeof $group$16_notes_and_random$5_notes, "notes"> | GroupSpec.NamedAt<typeof $group$16_notes_and_random$6_random, "random">>, "notes_and_random">;
  readonly users: GroupSpec.NamedAt<typeof $group$5_users, "users">;
  readonly viewer: GroupSpec.NamedAt<typeof $group$6_viewer, "viewer">;
  readonly workpool: GroupSpec.NamedAt<typeof $group$8_workpool, "workpool">;
}> = Spec.make().addAt("email", $group$5_email).addAt("env", $group$3_env).addAt("notes_and_random", GroupSpec.makeAt("notes_and_random").addGroupAt("notes", $group$16_notes_and_random$5_notes).addGroupAt("random", $group$16_notes_and_random$6_random)).addAt("users", $group$5_users).addAt("viewer", $group$6_viewer).addAt("workpool", $group$8_workpool);

export default spec;
