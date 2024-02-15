import { Auth, UserIdentity } from "convex/server";
import { Effect, Option, pipe } from "effect";

export interface EffectAuth {
  getUserIdentity(): Effect.Effect<Option.Option<UserIdentity>>;
}

export class EffectAuthImpl implements EffectAuth {
  constructor(private auth: Auth) {}
  getUserIdentity(): Effect.Effect<Option.Option<UserIdentity>> {
    return pipe(
      Effect.promise(() => this.auth.getUserIdentity()),
      Effect.map(Option.fromNullable),
    );
  }
}
