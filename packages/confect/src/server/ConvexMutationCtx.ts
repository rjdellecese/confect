import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { Context } from "effect";

export const ConvexMutationCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericMutationCtx<DataModel>>(
    "@rjdellecese/confect/ConvexMutationCtx",
  );

export type ConvexMutationCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof ConvexMutationCtx<DataModel>
>["Identifier"];
