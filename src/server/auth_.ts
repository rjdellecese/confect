import type { Auth } from "convex/server";
import { Effect } from "effect";

export class ConvexAuth extends Effect.Tag("@rjdellecese/confect/ConvexAuth")<
  ConvexAuth,
  Auth
>() {}

export class ConfectAuth extends Effect.Service<ConfectAuth>()(
  "@rjdellecese/confect/ConfectAuth",
  {
    succeed: {
      // TODO
      getUserIdentity: ConvexAuth.use(({ getUserIdentity }) =>
        getUserIdentity(),
      ),
    },
  },
) {}
