import { Effect, Schema } from "effect";
import type {
  DocumentDecodeError,
  DocumentEncodeError,
} from "~/src/server/database";
import { api } from "~/test/convex/_generated/api";
import {
  action,
  ConfectDatabaseWriter,
  ConfectScheduler,
  mutation,
} from "~/test/convex/confect";

export const insertAfter = action({
  args: Schema.Struct({
    text: Schema.String,
    millis: Schema.Duration,
  }),
  returns: Schema.Null,
  handler: ({ text, millis }): Effect.Effect<null, never, ConfectScheduler> =>
    Effect.gen(function* () {
      const scheduler = yield* ConfectScheduler;

      yield* scheduler.runAfter(millis, api.scheduler.scheduledInsert, {
        text,
      });

      return null;
    }),
});

export const scheduledInsert = mutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.Null,
  handler: ({
    text,
  }): Effect.Effect<
    null,
    DocumentEncodeError | DocumentDecodeError,
    ConfectDatabaseWriter
  > =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.insert("notes", { text });

      return null;
    }),
});

export const insertAt = action({
  args: Schema.Struct({
    text: Schema.String,
    timestamp: Schema.DateTimeUtc,
  }),
  returns: Schema.Null,
  handler: ({
    text,
    timestamp,
  }): Effect.Effect<null, never, ConfectScheduler> =>
    Effect.gen(function* () {
      const scheduler = yield* ConfectScheduler;

      yield* scheduler.runAt(timestamp, api.scheduler.scheduledInsert, {
        text,
      });

      return null;
    }),
});
