import { GroupSpec as Group, Spec } from "@confect/core";
import emailSpec from "../email.spec";
import envSpec from "../env.spec";
import notes_and_random_notesSpec from "../notes_and_random/notes.spec";
import notes_and_random_randomSpec from "../notes_and_random/random.spec";
import usersSpec from "../users.spec";
import viewerSpec from "../viewer.spec";
import workpoolSpec from "../workpool.spec";

const spec: Spec.Spec<{
  readonly email: Group.NamedAt<typeof emailSpec, "email">;
  readonly env: Group.NamedAt<typeof envSpec, "env">;
  readonly notes_and_random: Group.NamedAt<Group.GroupSpec<"Convex", "notes_and_random", never, Group.NamedAt<typeof notes_and_random_notesSpec, "notes"> | Group.NamedAt<typeof notes_and_random_randomSpec, "random">>, "notes_and_random">;
  readonly users: Group.NamedAt<typeof usersSpec, "users">;
  readonly viewer: Group.NamedAt<typeof viewerSpec, "viewer">;
  readonly workpool: Group.NamedAt<typeof workpoolSpec, "workpool">;
}> = Spec.fromGroups({
  ["email"]: emailSpec,
  ["env"]: envSpec,
  ["notes_and_random"]: Group.addGroupsAt(Group.make(), {
    ["notes"]: notes_and_random_notesSpec,
    ["random"]: notes_and_random_randomSpec,
  }),
  ["users"]: usersSpec,
  ["viewer"]: viewerSpec,
  ["workpool"]: workpoolSpec,
}) as typeof spec;

export default spec;
