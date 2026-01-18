import { describe } from "@effect/vitest";
import { assertEquals, assertFailure } from "@effect/vitest/utils";
import { Cause, Effect, Runtime } from "effect";
import { NoUserIdentityFoundError } from "../src/Auth";
import { api } from "./confect/_generated/refs";
import { TestConfect } from "./TestConfect";
import { effect } from "./testUtils";

describe("authentication", () => {
  effect("when user is authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

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
      const c = yield* TestConfect;

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
