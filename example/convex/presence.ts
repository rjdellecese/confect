import { Presence } from "@convex-dev/presence";
import { Effect, Schema } from "effect";
import { components } from "./_generated/api.js";
import {
  ConfectMutationCtx,
  ConfectQueryCtx,
  mutation,
  query,
} from "./confect";

export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: Schema.Struct({
    roomId: Schema.String,
    userId: Schema.String,
    sessionId: Schema.String,
    interval: Schema.Number,
  }),
  returns: Schema.Struct({
    roomToken: Schema.String,
    sessionToken: Schema.String,
  }),
  handler: ({ roomId, userId, sessionId, interval }) =>
    Effect.gen(function* () {
      const { ctx } = yield* ConfectMutationCtx;
      return yield* Effect.tryPromise({
        try: () => presence.heartbeat(ctx, roomId, userId, sessionId, interval),
        catch: (error) => Effect.fail(error),
      });
    }),
});

export const list = query({
  args: Schema.Struct({
    roomToken: Schema.String,
  }),
  returns: Schema.Array(
    Schema.Struct({
      userId: Schema.String,
      online: Schema.Boolean,
      lastDisconnected: Schema.Number,
    }),
  ),
  handler: ({ roomToken }) =>
    Effect.gen(function* () {
      const { ctx } = yield* ConfectQueryCtx;
      return yield* Effect.tryPromise({
        try: () => presence.list(ctx, roomToken),
        catch: (error) => Effect.fail(error),
      });
    }),
});

export const disconnect = mutation({
  args: Schema.Struct({
    sessionToken: Schema.String,
  }),
  returns: Schema.Null,
  handler: ({ sessionToken }) =>
    Effect.gen(function* () {
      const { ctx } = yield* ConfectMutationCtx;
      return yield* Effect.tryPromise({
        try: () => presence.disconnect(ctx, sessionToken),
        catch: (error) => Effect.fail(error),
      });
    }),
});
