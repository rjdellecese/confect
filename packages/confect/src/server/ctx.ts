import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { Context } from "effect";

export const ConvexQueryCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericQueryCtx<DataModel>>(
    "@rjdellecese/confect/ConvexQueryCtx"
  );

export type ConvexQueryCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexQueryCtx<DataModel>
>["Service"];

export const ConvexMutationCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericMutationCtx<DataModel>>(
    "@rjdellecese/confect/ConvexMutationCtx"
  );

export type ConvexMutationCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexMutationCtx<DataModel>
>["Service"];

export const ConvexActionCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericActionCtx<DataModel>>(
    "@rjdellecese/confect/ConvexActionCtx"
  );

export type ConvexActionCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexActionCtx<DataModel>
>["Service"];
