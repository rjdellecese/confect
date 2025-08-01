import { Effect, Schema } from "effect";
import { internal } from "../convex/_generated/api";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
  confectAction,
  confectInternalAction,
  confectInternalMutation,
  confectInternalQuery,
  confectMutation,
  confectQuery,
} from "../convex/confect";

export const runInQuery = confectQuery({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }): Effect.Effect<string, never, ConfectQueryRunner> =>
    Effect.gen(function* () {
      const { runQuery } = yield* ConfectQueryRunner;

      return yield* runQuery(internal.runners.queryToRun, {
        text,
      });
    }),
});

export const queryToRun = confectInternalQuery({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});

export const runInMutation = confectMutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }): Effect.Effect<string, never, ConfectMutationRunner> =>
    Effect.gen(function* () {
      const { runMutation } = yield* ConfectMutationRunner;

      return yield* runMutation(internal.runners.mutationToRun, {
        text,
      });
    }),
});

export const mutationToRun = confectInternalMutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});

export const runInAction = confectAction({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }): Effect.Effect<string, never, ConfectActionRunner> =>
    Effect.gen(function* () {
      const { runAction } = yield* ConfectActionRunner;

      return yield* runAction(internal.runners.actionToRun, {
        text,
      });
    }),
});

export const actionToRun = confectInternalAction({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});
