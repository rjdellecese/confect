import type { Auth } from "convex/server";
import { Effect } from "effect";

export class ConvexAuth extends Effect.Tag("@rjdellecese/confect/ConvexAuth")<
  ConvexAuth,
  { readonly self: Auth }
>() {}

export class ConfectAuth extends Effect.Service<ConfectAuth>()(
  "@rjdellecese/confect/ConfectAuth",
  {
    effect: Effect.gen(function* () {
      const auth = yield* ConvexAuth.self;

      return {
        getUserIdentity: Effect.promise(() => auth.getUserIdentity()),
      };
    }),
  },
) {}
