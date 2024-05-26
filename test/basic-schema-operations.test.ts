import { expect } from "@effect/vitest";
import { Clock, Effect } from "effect";

import { api } from "~/test/convex/_generated/api";
import { Doc, Id } from "~/test/convex/_generated/dataModel";
import { test } from "~/test/convex-effect-test";
import { ConvexService } from "~/test/convex-service";

test("are inserted and then retrieved", () =>
  Effect.gen(function* () {
    const c = yield* ConvexService;

    const content = "Hello, world!";

    yield* Effect.promise(() =>
      c.mutation(api.insertNote.default, {
        content,
      })
    );

    const notes: Doc<"notes">[] = yield* Effect.promise(() =>
      c.query(api.listNotes.default, {})
    );

    yield* Effect.succeed(expect(notes[0]?.["content"]).toEqual(content));
  }));

test("todos are inserted and then retrieved", () =>
  Effect.gen(function* () {
    const c = yield* ConvexService;

    const content = "Hello, world!";
    const dueDateMillis = yield* Clock.currentTimeMillis;

    const todoId: Id<"todos"> = yield* Effect.promise(() =>
      c.mutation(api.insertTodo.default, {
        content,
        dueDate: dueDateMillis,
      })
    );

    const todo = yield* Effect.promise(() => c.run(({ db }) => db.get(todoId)));

    expect(todo?.dueDate).toEqual(dueDateMillis);
  }));
