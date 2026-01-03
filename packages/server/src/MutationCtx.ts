import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { Context } from "effect";

export const MutationCtx = <DataModel extends GenericDataModel>() =>
  Context.GenericTag<GenericMutationCtx<DataModel>>(
    "@rjdellecese/confect/server/MutationCtx",
  );

export type MutationCtx<DataModel extends GenericDataModel> = ReturnType<
  typeof MutationCtx<DataModel>
>["Identifier"];
