import { v } from "convex/values";
import { components } from "../../convex/_generated/api";
import { mutation } from "../../convex/_generated/server";

// A vanilla Convex consumer sees the encoded wire contract, not Effect codecs.
export const roundTrip = mutation({
  args: { run: v.string() },
  // oxlint-disable-next-line effecttsgo/async-function -- Deliberately exercise a vanilla Convex consumer without Effect.
  handler: async (ctx, { run }) => {
    const id = await ctx.runMutation(components.first.counter.create, {
      run,
      count: "2",
    });
    const docs = await ctx.runQuery(components.first.counter.list, { run });
    return { id, docs };
  },
});
