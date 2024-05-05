import { effect, expect } from "@effect/vitest";
import { convexTest } from "convex-test";
import { Effect } from "effect";

import { api } from "~/test/convex/_generated/api";
import schema from "~/test/convex/schema";

effect("notes are inserted and then retrieved", () =>
  Effect.gen(function* (_) {
    const t = convexTest(schema);
    const content = "Hello, world!";
    yield* _(
      Effect.promise(() => t.mutation(api.insertNote.default, { content })),
    );
    const notes = yield* _(
      Effect.promise(() => t.query(api.listNotes.default)),
    );
    expect(notes.length).toBeGreaterThan(0);
  }),
);
