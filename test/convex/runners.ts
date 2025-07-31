import { Effect, Schema } from "effect";
import { internal } from "../convex/_generated/api";
import {
  action,
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../convex/confect";

export const runInQuery = query({
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

export const queryToRun = internalQuery({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});

export const runInMutation = mutation({
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

export const mutationToRun = internalMutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});

export const runInAction = action({
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

export const actionToRun = internalAction({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({ text }) => Effect.succeed(text),
});
