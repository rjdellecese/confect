import { GroupSpec, Spec } from "@confect/core";
import email from "../email.spec";
import env from "../env.spec";
import notes_and_random_notes from "../notes_and_random/notes.spec";
import notes_and_random_random from "../notes_and_random/random.spec";
import users from "../users.spec";
import viewer from "../viewer.spec";
import workpool from "../workpool.spec";

const spec: Spec.Spec<{
  readonly email: GroupSpec.NamedAt<typeof email, "email">;
  readonly env: GroupSpec.NamedAt<typeof env, "env">;
  readonly notes_and_random: GroupSpec.NamedAt<GroupSpec.GroupSpec<"Convex", "notes_and_random", never, GroupSpec.NamedAt<typeof notes_and_random_notes, "notes"> | GroupSpec.NamedAt<typeof notes_and_random_random, "random">>, "notes_and_random">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly viewer: GroupSpec.NamedAt<typeof viewer, "viewer">;
  readonly workpool: GroupSpec.NamedAt<typeof workpool, "workpool">;
}> = (Spec.make() as any).addAt("email", (email as any)).addAt("env", (env as any)).addAt("notes_and_random", (GroupSpec.makeAt("notes_and_random") as any).addGroupAt("notes", (notes_and_random_notes as any)).addGroupAt("random", (notes_and_random_random as any))).addAt("users", (users as any)).addAt("viewer", (viewer as any)).addAt("workpool", (workpool as any));

export default spec;
