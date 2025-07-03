import type { Auth } from "convex/server";
import { Effect, Option } from "effect";

export class ConvexAuth extends Effect.Tag("@rjdellecese/confect/ConvexAuth")<
  ConvexAuth,
  Auth
>() {}

export class ConfectAuth extends Effect.Service<ConfectAuth>()(
  "@rjdellecese/confect/ConfectAuth",
  {
    succeed: {
      // TODO: Which errors might occur?
      getUserIdentity: ConvexAuth.use(({ getUserIdentity }) =>
        getUserIdentity(),
      ).pipe(Effect.map(Option.fromNullable)),
    },
  },
) {}
