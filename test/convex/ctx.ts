import { Effect, Schema } from "effect";
import { api } from "./_generated/api";
import {
  ActionCtx,
  ConfectId,
  confectAction,
  confectMutation,
  confectQuery,
  MutationCtx,
  QueryCtx,
} from "./confect";

export const get = confectQuery({
  args: Schema.Struct({
    id: ConfectId("notes"),
  }),
  returns: Schema.Union(Schema.String, Schema.Null),
  handler: ({ id }) =>
    Effect.gen(function* () {
      const ctx = yield* QueryCtx;

      const note = yield* Effect.promise(() => ctx.db.get(id));

      return note ? note.text : null;
    }),
});

export const insert = confectMutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: ConfectId("notes"),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;

      const id = yield* Effect.promise(() =>
        ctx.db.insert("notes", {
          text,
        }),
      );

      return id;
    }),
});

export const actionGet = confectAction({
  args: Schema.Struct({
    id: ConfectId("notes"),
  }),
  returns: Schema.Union(Schema.String, Schema.Null),
  handler: ({ id }): Effect.Effect<string | null, never, ActionCtx> =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;

      const text = yield* Effect.promise(() =>
        ctx.runQuery(api.ctx.get, {
          id,
        }),
      );

      return text;
    }),
});
