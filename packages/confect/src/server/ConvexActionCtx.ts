import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { Context } from "effect";

export const ConvexActionCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericActionCtx<DataModel>>(
    "@rjdellecese/confect/server/ConvexActionCtx",
  );

export type ConvexActionCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexActionCtx<DataModel>
>["Identifier"];
