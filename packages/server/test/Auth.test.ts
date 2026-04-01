import type { Auth as ConvexAuth, UserIdentity } from "convex/server";
import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Exit } from "effect";
import * as Auth from "../src/Auth";

const testConvexAuth = (identity: UserIdentity | null): ConvexAuth => ({
  getUserIdentity: () => Promise.resolve(identity),
});

describe("Auth", () => {
  it.effect("getUserIdentity succeeds when identity exists", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Auth;
      const identity = yield* auth.getUserIdentity;
      assertEquals(identity.subject, "user123");
    }).pipe(
      Effect.provide(
        Auth.layer(
          testConvexAuth({
            subject: "user123",
            tokenIdentifier: "token",
          } as UserIdentity),
        ),
      ),
    ),
  );

  it.effect(
    "getUserIdentity fails with NoUserIdentityFoundError when absent",
    () =>
      Effect.gen(function* () {
        const auth = yield* Auth.Auth;
        const exit = yield* auth.getUserIdentity.pipe(Effect.exit);
        assertTrue(Exit.isFailure(exit));
      }).pipe(Effect.provide(Auth.layer(testConvexAuth(null)))),
  );

  it.effect("NoUserIdentityFoundError has a descriptive message", () =>
    Effect.sync(() => {
      const error = new Auth.NoUserIdentityFoundError();
      assertTrue(error.message.includes("No user identity found"));
      assertEquals(error._tag, "NoUserIdentityFoundError");
    }),
  );
});
