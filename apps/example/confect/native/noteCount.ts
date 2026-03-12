import { v } from "convex/values";
import { query } from "../../convex/_generated/server";

export const noteCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").collect();
    return notes.length;
  },
});
