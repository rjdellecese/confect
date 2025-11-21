import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import { Context } from "effect";

export const ConvexQueryCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericQueryCtx<DataModel>>(
    "@rjdellecese/confect/ConvexQueryCtx",
  );

export type ConvexQueryCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexQueryCtx<DataModel>
>["Service"];
