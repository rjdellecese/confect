import { GroupSpec as GroupSpec_, Spec } from "@confect/core";
import emailSpec from "../email.spec";
import envSpec from "../env.spec";
import notes_and_random_notesSpec from "../notes_and_random/notes.spec";
import notes_and_random_randomSpec from "../notes_and_random/random.spec";
import usersSpec from "../users.spec";
import viewerSpec from "../viewer.spec";
import workpoolSpec from "../workpool.spec";

/**
 * Function contract for the application, assembled from its group specs. Use it
 * to inspect the complete function tree without loading handler implementations
 * or evaluating the functions' schema factories.
 *
 * @category models
 */
const spec: Spec.Spec<{
  readonly email: GroupSpec_.NamedAt<typeof emailSpec, "email">;
  readonly env: GroupSpec_.NamedAt<typeof envSpec, "env">;
  readonly notes_and_random: GroupSpec_.NamedAt<GroupSpec_.GroupSpec<"Convex", "notes_and_random", never, GroupSpec_.NamedAt<typeof notes_and_random_notesSpec, "notes"> | GroupSpec_.NamedAt<typeof notes_and_random_randomSpec, "random">>, "notes_and_random">;
  readonly users: GroupSpec_.NamedAt<typeof usersSpec, "users">;
  readonly viewer: GroupSpec_.NamedAt<typeof viewerSpec, "viewer">;
  readonly workpool: GroupSpec_.NamedAt<typeof workpoolSpec, "workpool">;
}> = Spec.fromGroups({
  ["email"]: emailSpec,
  ["env"]: envSpec,
  ["notes_and_random"]: GroupSpec_.addGroupsAt(GroupSpec_.make(), {
    ["notes"]: notes_and_random_notesSpec,
    ["random"]: notes_and_random_randomSpec,
  }),
  ["users"]: usersSpec,
  ["viewer"]: viewerSpec,
  ["workpool"]: workpoolSpec,
}) as typeof spec;

export default spec;
