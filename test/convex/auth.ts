import { Effect, Schema } from "effect";
import { UserIdentity } from "~/src/server/schemas/UserIdentity";
import { ConfectAuth, confectQuery } from "~/test/convex/confect";

export const getUserIdentity = confectQuery({
  args: Schema.Struct({}),
  returns: UserIdentity({}),
  handler: () =>
    Effect.gen(function* () {
      const auth = yield* ConfectAuth;

      return yield* auth.getUserIdentity;
    }),
});
