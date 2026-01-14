import { describe } from "@effect/vitest";
import { assertEquals, assertSuccess } from "@effect/vitest/utils";
import { Effect } from "effect";
import { api } from "./convex/_generated/api";
import { TestConfect } from "./TestConfect";
import { effect } from "./testUtils";

effect("ConfectQueryRunner", () =>
  Effect.gen(function* () {
    const c = yield* TestConfect;

    const text = "Hello, world!";

    const exit = yield* c
      .query(api.runners.runInQuery, { text })
      .pipe(Effect.exit);

    assertSuccess(exit, text);
  }),
);

describe("ConfectMutationRunner", () => {
  effect("sub-mutation success", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

      const text = "Hello, world!";

      const exit = yield* c
        .mutation(api.runners.runInMutation, { text })
        .pipe(Effect.exit);

      assertSuccess(exit, text);
    }),
  );

  effect("sub-mutation failure", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

      const rollbackMessage = "Rolled back";

      const result = yield* c.mutation(api.runners.failingRunInMutation, {
        rollbackMessage,
      });

      assertEquals(result, rollbackMessage);
    }),
  );
});

effect("ConfectActionRunner", () =>
  Effect.gen(function* () {
    const c = yield* TestConfect;

    const text = "Hello, world!";

    const exit = yield* c
      .action(api.runners.runInAction, { text })
      .pipe(Effect.exit);

    assertSuccess(exit, text);
  }),
);
