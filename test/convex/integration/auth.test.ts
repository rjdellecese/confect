import { describe } from "@effect/vitest";
import { assertEquals, assertFailure } from "@effect/vitest/utils";
import { Cause, Effect, Runtime } from "effect";
import { api } from "~/test/convex/_generated/api";
import { test } from "~/test/convex-effect-test";
import { TestConvexService } from "~/test/test-convex-service";
import { NoUserIdentityFoundError } from "../../../src/server/auth";

describe("authentication", () => {
  test("when user is authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const name = "Joe";

      const asUser = c.withIdentity({
        name,
      });

      const userIdentity = yield* asUser.query(
        api.integration.auth.getUserIdentity,
        {},
      );

      assertEquals(userIdentity.name, name);
    }));

  test("when user is not authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const exit = yield* c
        .query(api.integration.auth.getUserIdentity, {})
        .pipe(Effect.exit);

      assertFailure(
        exit,
        Cause.die(
          Runtime.makeFiberFailure(Cause.fail(new NoUserIdentityFoundError())),
        ),
      );
    }));
});
