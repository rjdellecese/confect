import { effect, expect } from "@effect/vitest";
import { Effect } from "effect";

import { api } from "~/test/convex/_generated/api";
import { Doc } from "~/test/convex/_generated/dataModel";

effect("notes are inserted and then retrieved", () =>
  Effect.gen(function* () {
    const content = "Hello, world!";

    yield* Effect.promise(() =>
      convexHttpClient.mutation(api.insertNote.default, {
        content,
      })
    );

    const notes: Doc<"notes">[] = yield* Effect.promise(() =>
      convexHttpClient.query(api.listNotes.default)
    );

    yield* Effect.succeed(expect(notes[0]?.content).toEqual(content));
  })
);
