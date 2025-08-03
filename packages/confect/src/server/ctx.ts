import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { Context } from "effect";

export const ConvexQueryCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericQueryCtx<DataModel>>(
    "@rjdellecese/confect/ConvexQueryCtx",
  );

export const ConvexMutationCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericMutationCtx<DataModel>>(
    "@rjdellecese/confect/ConvexMutationCtx",
  );

export const ConvexActionCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericActionCtx<DataModel>>(
    "@rjdellecese/confect/ConvexActionCtx",
  );
