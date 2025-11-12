import { Effect, Schema } from "effect";
import * as ConfectActionRunner from "../../src/server/ConfectActionRunner";
import * as ConfectMutationRunner from "../../src/server/ConfectMutationRunner";
import * as ConfectQueryRunner from "../../src/server/ConfectQueryRunner";
import { internal } from "../convex/_generated/api";
import {
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
  handler: ({
    text,
  }): Effect.Effect<string, never, ConfectQueryRunner.ConfectQueryRunner> =>
    Effect.gen(function* () {
      const runQuery = yield* ConfectQueryRunner.ConfectQueryRunner;

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
  handler: ({
    text,
  }): Effect.Effect<
    string,
    ConfectMutationRunner.MutationRollback,
    ConfectMutationRunner.ConfectMutationRunner
  > =>
    Effect.gen(function* () {
      const runMutation = yield* ConfectMutationRunner.ConfectMutationRunner;

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

export const failingRunInMutation = confectMutation({
  args: Schema.Struct({ rollbackMessage: Schema.String }),
  returns: Schema.String,
  handler: ({
    rollbackMessage,
  }): Effect.Effect<
    string,
    ConfectMutationRunner.MutationRollback,
    ConfectMutationRunner.ConfectMutationRunner
  > =>
    Effect.gen(function* () {
      const runMutation = yield* ConfectMutationRunner.ConfectMutationRunner;

      return yield* runMutation(internal.runners.failingMutationToRun, {}).pipe(
        Effect.catchTag("MutationRollback", () =>
          Effect.succeed(rollbackMessage)
        )
      );
    }),
});

export const failingMutationToRun = confectInternalMutation({
  args: Schema.Struct({}),
  returns: Schema.String,
  handler: (): Effect.Effect<
    string,
    ConfectMutationRunner.MutationRollback,
    ConfectMutationRunner.ConfectMutationRunner
  > => Effect.die(new Error()),
});

export const runInAction = confectAction({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.String,
  handler: ({
    text,
  }): Effect.Effect<string, never, ConfectActionRunner.ConfectActionRunner> =>
    Effect.gen(function* () {
      const runAction = yield* ConfectActionRunner.ConfectActionRunner;

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
