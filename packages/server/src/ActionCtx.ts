import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { Context } from "effect";

export const ActionCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericActionCtx<DataModel>>("@confect/server/ActionCtx");

export type ActionCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ActionCtx<DataModel>
>["Identifier"];
