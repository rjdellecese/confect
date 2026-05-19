import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import { Context } from "effect";

export const QueryCtx = <DataModel extends GenericDataModel>() =>
  Context.Service<GenericQueryCtx<DataModel>>("@confect/server/QueryCtx");

export type QueryCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof QueryCtx<DataModel>
>["Identifier"];
