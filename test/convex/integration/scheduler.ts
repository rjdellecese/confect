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
      yield* ConfectScheduler.runAfter(
        millis,
        api.integration.scheduler.scheduledInsert,
        {
          text,
        },
      );

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
      yield* ConfectScheduler.runAt(
        timestamp,
        api.integration.scheduler.scheduledInsert,
        {
          text,
        },
      );

      return null;
    }),
});
