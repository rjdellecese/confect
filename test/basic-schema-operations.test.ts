import { expect } from "@effect/vitest";
import { Clock, Effect } from "effect";

import { api } from "~/test/convex/_generated/api";
import { Doc, Id } from "~/test/convex/_generated/dataModel";
import { test } from "~/test/convex-effect-test";
import { TestConvexService } from "~/test/test-convex-service";

test("todos are inserted and then retrieved", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const content = "Hello, world!";

    yield* c.mutation(api.insertNote.default, {
      content,
    });

    const notes: Doc<"notes">[] = yield* c.query(api.listNotes.default, {});

    yield* Effect.succeed(expect(notes[0]?.["content"]).toEqual(content));
  }));

test("JS dates are serialized and deserialized properly", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const content = "Hello, world!";
    const dueDateMillis = yield* Clock.currentTimeMillis;

    const todoId: Id<"todos"> = yield* c.mutation(api.insertTodo.default, {
      content,
      dueDate: dueDateMillis,
      assignees: [],
    });

    const todo = yield* c.run(({ db }) => db.get(todoId));

    expect(todo?.dueDate).toEqual(dueDateMillis);
  }));
