import { Schema } from "effect";
import { UserIdentity } from "~/src/server/schemas/UserIdentity";
import { ConfectAuth, query } from "~/test/convex/confect";

export const getUserIdentity = query({
  args: Schema.Struct({}),
  returns: UserIdentity({}),
  handler: () => ConfectAuth.getUserIdentity,
});
