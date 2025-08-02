import { Effect, Schema } from "effect";
import { ConfectAuth, confectQuery } from "./confect";
import { UserIdentity } from "../../src/server/schemas/UserIdentity";

export const getUserIdentity = confectQuery({
  args: Schema.Struct({}),
  returns: UserIdentity({}),
  handler: () =>
    Effect.gen(function* () {
      const auth = yield* ConfectAuth;

      return yield* auth.getUserIdentity;
    }),
});
