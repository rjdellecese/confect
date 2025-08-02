import { describe } from "@effect/vitest";
import { assertEquals, assertFailure } from "@effect/vitest/utils";
import { Cause, Effect, Runtime } from "effect";
import { NoUserIdentityFoundError } from "../src/server/auth";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("authentication", () => {
  effect("when user is authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const name = "Joe";

      const asUser = c.withIdentity({
        name,
      });

      const userIdentity = yield* asUser.query(api.auth.getUserIdentity, {});

      assertEquals(userIdentity.name, name);
    }),
  );

  effect("when user is not authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const exit = yield* c
        .query(api.auth.getUserIdentity, {})
        .pipe(Effect.exit);

      assertFailure(
        exit,
        Cause.die(
          Runtime.makeFiberFailure(Cause.fail(new NoUserIdentityFoundError())),
        ),
      );
    }),
  );
});
