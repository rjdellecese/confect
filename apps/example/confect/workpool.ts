import {
  type WorkId,
  Workpool,
  vOnCompleteArgs,
  vWorkId,
} from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "../convex/_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../convex/_generated/server";

const pool = new Workpool(components.workpool, {
  maxParallelism: 3,
});

export const enqueue = mutation({
  args: {},
  returns: vWorkId,
  handler: async (ctx): Promise<WorkId> => {
    return await pool.enqueueAction(
      ctx,
      internal.workpool.backgroundWork,
      {},
      { onComplete: internal.workpool.onComplete },
    );
  },
});

export const status = query({
  args: { workId: vWorkId },
  returns: v.union(
    v.object({ state: v.literal("pending"), previousAttempts: v.number() }),
    v.object({ state: v.literal("running"), previousAttempts: v.number() }),
    v.object({ state: v.literal("finished") }),
  ),
  handler: async (ctx, { workId }) => {
    return await pool.status(ctx, workId);
  },
});

export const backgroundWork = internalAction({
  args: {},
  returns: v.null(),
  handler: async (): Promise<null> => {
    await new Promise((resolve) =>
      setTimeout(resolve, 2000 + Math.random() * 3000),
    );
    return null;
  },
});

export const onComplete = internalMutation({
  args: vOnCompleteArgs(),
  returns: v.null(),
  handler: async (_ctx, { result }): Promise<null> => {
    if (result.kind === "success") {
      console.log("Background work completed successfully");
    } else if (result.kind === "failed") {
      console.error("Background work failed:", result.error);
    }
    return null;
  },
});
