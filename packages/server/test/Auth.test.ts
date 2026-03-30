import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Exit } from "effect";
import * as Auth from "../src/Auth";

describe("Auth", () => {
  it.effect("getUserIdentity succeeds when identity exists", () =>
    Effect.gen(function* () {
      const fakeAuth = {
        getUserIdentity: async () => ({
          subject: "user123",
          tokenIdentifier: "token",
        }),
      };

      const identity = yield* Effect.gen(function* () {
        const auth = yield* Auth.Auth;
        return yield* auth.getUserIdentity;
      }).pipe(Effect.provide(Auth.layer(fakeAuth as any)));

      assertEquals(identity.subject, "user123");
    }),
  );

  it.effect(
    "getUserIdentity fails with NoUserIdentityFoundError when null",
    () =>
      Effect.gen(function* () {
        const fakeAuth = {
          getUserIdentity: async () => null,
        };

        const exit = yield* Effect.gen(function* () {
          const auth = yield* Auth.Auth;
          return yield* auth.getUserIdentity;
        }).pipe(Effect.provide(Auth.layer(fakeAuth as any)), Effect.exit);

        assertTrue(Exit.isFailure(exit));
      }),
  );

  it.effect("NoUserIdentityFoundError has a descriptive message", () =>
    Effect.gen(function* () {
      const error = new Auth.NoUserIdentityFoundError();
      assertTrue(error.message.includes("No user identity found"));
      assertEquals(error._tag, "NoUserIdentityFoundError");
    }),
  );
});
