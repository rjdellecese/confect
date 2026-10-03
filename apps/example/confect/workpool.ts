import {
  type WorkId,
  Workpool,
  vOnCompleteArgs,
  vWorkId,
} from "@convex-dev/workpool";
import { v } from "convex/values";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";
import { internal } from "../convex/_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../convex/_generated/server";
import { components } from "./_generated/components";

const pool = new Workpool(components.workpool, {
  maxParallelism: 3,
});

export const backgroundWork = internalAction({
  args: {},
  returns: v.null(),
  handler: (): Promise<null> =>
    Effect.gen(function* () {
      const delay = yield* Random.nextBetween(2_000, 5_000);
      yield* Effect.sleep(Duration.millis(delay));
      return null;
    }).pipe(Effect.runPromise),
});

export const onComplete = internalMutation({
  args: vOnCompleteArgs(),
  returns: v.null(),
  handler: (_ctx, { result }): null => {
    if (result.kind === "success") {
      // oxlint-disable-next-line effecttsgo/global-console -- This is a raw Convex handler, so console output is captured by Convex's function logs.
      console.log("Background work completed successfully");
    } else if (result.kind === "failed") {
      // oxlint-disable-next-line effecttsgo/global-console -- This is a raw Convex handler, so console output is captured by Convex's function logs.
      console.error("Background work failed:", result.error);
    }
    return null;
  },
});

export const enqueue = mutation({
  args: {},
  returns: vWorkId,
  handler: (ctx): Promise<WorkId> =>
    pool.enqueueAction(
      ctx,
      internal.workpool.backgroundWork,
      {},
      { onComplete: internal.workpool.onComplete },
    ),
});

export const status = query({
  args: { workId: vWorkId },
  returns: v.union(
    v.object({ state: v.literal("pending"), previousAttempts: v.number() }),
    v.object({ state: v.literal("running"), previousAttempts: v.number() }),
    v.object({ state: v.literal("finished") }),
  ),
  handler: (ctx, { workId }) => pool.status(ctx, workId),
});
