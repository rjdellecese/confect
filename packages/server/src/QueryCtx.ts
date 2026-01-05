import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import { Context } from "effect";

export const QueryCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericQueryCtx<DataModel>>(
    "@confect/server/QueryCtx",
  );

export type QueryCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof QueryCtx<DataModel>
>["Identifier"];
