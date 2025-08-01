import { assertSuccess } from "@effect/vitest/utils";
import { Effect } from "effect";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

effect("ConfectQueryRunner", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    const exit = yield* c
      .query(api.runners.runInQuery, { text })
      .pipe(Effect.exit);

    assertSuccess(exit, text);
  }),
);

effect("ConfectMutationRunner", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    const exit = yield* c
      .mutation(api.runners.runInMutation, { text })
      .pipe(Effect.exit);

    assertSuccess(exit, text);
  }),
);

effect("ConfectActionRunner", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    const exit = yield* c
      .action(api.runners.runInAction, { text })
      .pipe(Effect.exit);

    assertSuccess(exit, text);
  }),
);
