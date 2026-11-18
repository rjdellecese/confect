import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "../convex/_generated/server";

// Raw Convex endpoints exercise client codecs independently of server codecs,
// including deliberately incompatible return/error data.
const echo = {
  args: {
    value: v.optional(v.string()),
    failure: v.optional(v.union(v.literal("typed"), v.literal("unknown"))),
  },
  handler: (
    _ctx: unknown,
    args: { value?: string; failure?: "typed" | "unknown" },
  ) => {
    if (args.failure === "typed") {
      throw new ConvexError({ _tag: "MissingValue", caseId: "echo" });
    }
    if (args.failure === "unknown") {
      throw new ConvexError({ message: "Unmodeled backend failure" });
    }
    return args.value ?? "0";
  },
};

export const echoQuery = query(echo);
export const echoMutation = mutation(echo);
export const echoAction = action(echo);

export const read = query({
  args: { caseId: v.string() },
  // @effect-diagnostics-next-line asyncFunction:off
  handler: async (ctx, { caseId }) => {
    const doc = await ctx.db
      .query("transactionNotes")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .unique();
    if (doc === null) {
      throw new ConvexError({ _tag: "MissingValue", caseId });
    }
    return doc.value;
  },
});

export const write = mutation({
  args: { caseId: v.string(), value: v.union(v.string(), v.null()) },
  // @effect-diagnostics-next-line asyncFunction:off
  handler: async (ctx, { caseId, value }) => {
    const doc = await ctx.db
      .query("transactionNotes")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .unique();
    if (doc !== null) {
      await ctx.db.delete(doc._id);
    }
    if (value !== null) {
      await ctx.db.insert("transactionNotes", { caseId, value });
    }
    return null;
  },
});
