import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { components } from "../../convex/_generated/api";
import { mutation, query } from "../../convex/_generated/server";

export const paginate = query({
  args: {
    run: v.string(),
    second: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.string(),
      _creationTime: v.number(),
      run: v.string(),
      count: v.string(),
    }),
  ),
  handler: (ctx, { second, ...args }) =>
    ctx.runQuery(
      second
        ? components.second.counter.paginate
        : components.first.counter.paginate,
      args,
    ),
});

export const paginateTwice = query({
  args: { run: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) =>
    ctx
      .runQuery(components.first.counter.paginate, args)
      .then(() => ctx.runQuery(components.second.counter.paginate, args)),
});

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
