import type { Effect } from "effect";
import { Predicate } from "effect";
import type * as FunctionSpec from "../api/FunctionSpec";
import type * as ActionCtx from "./ActionCtx";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import type * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import type * as MutationCtx from "./MutationCtx";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryCtx from "./QueryCtx";
import type * as QueryRunner from "./QueryRunner";
import type * as Scheduler from "./Scheduler";
import type * as DatabaseSchema from "./DatabaseSchema";
import type {
  StorageActionWriter,
  StorageReader,
  StorageWriter,
} from "./Storage";
import type * as VectorSearch from "./VectorSearch";

// ============================================================================
// Type Definitions for Function Implementation Handlers
// ============================================================================

export type Handler<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends FunctionSpec.FunctionSpec.AnyWithProps,
> =
  Function extends FunctionSpec.FunctionSpec.WithFunctionType<Function, "Query">
    ? QueryHandler<Schema, Function>
    : Function extends FunctionSpec.FunctionSpec.WithFunctionType<
          Function,
          "Mutation"
        >
      ? MutationHandler<Schema, Function>
      : Function extends FunctionSpec.FunctionSpec.WithFunctionType<
            Function,
            "Action"
          >
        ? ActionHandler<Schema, Function>
        : never;

export type QueryHandler<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends
    FunctionSpec.FunctionSpec.AnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | DatabaseReader.DatabaseReader<Schema>
  | Auth.Auth
  | StorageReader
  | QueryRunner.QueryRunner
  | QueryCtx.QueryCtx<
      DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
    >
>;

export type MutationHandler<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends
    FunctionSpec.FunctionSpec.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | DatabaseReader.DatabaseReader<Schema>
  | DatabaseWriter.DatabaseWriter<Schema>
  | Auth.Auth
  | Scheduler.Scheduler
  | StorageReader
  | StorageWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | MutationCtx.MutationCtx<
      DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
    >
>;

export type ActionHandler<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends
    FunctionSpec.FunctionSpec.AnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  Function,
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader
  | StorageWriter
  | StorageActionWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | VectorSearch.VectorSearch<DataModel.DataModel.FromSchema<Schema>>
  | ActionCtx.ActionCtx<
      DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
    >
>;

type BaseHandler<Function extends FunctionSpec.FunctionSpec.AnyWithProps, R> = (
  args: FunctionSpec.FunctionSpec.Args<Function>["Type"],
) => Effect.Effect<
  FunctionSpec.FunctionSpec.Returns<Function>["Type"],
  never,
  R
>;

export declare namespace Handler {
  export type AnyWithProps = Handler<
    DatabaseSchema.DatabaseSchema.AnyWithProps,
    FunctionSpec.FunctionSpec.AnyWithProps
  >;

  export type WithName<
    Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
    Function extends FunctionSpec.FunctionSpec.AnyWithProps,
    Name extends string,
  > = Handler<Schema, FunctionSpec.FunctionSpec.WithName<Function, Name>>;
}

// ============================================================================
// RegistryItem - Registry Item
// ============================================================================

export const RegistryItemTypeId = "@rjdellecese/confect/server/RegistryItem";
export type RegistryItemTypeId = typeof RegistryItemTypeId;

export const isRegistryItem = (
  value: unknown,
): value is RegistryItem.AnyWithProps =>
  Predicate.hasProperty(value, RegistryItemTypeId);

const RegistryItemProto = {
  [RegistryItemTypeId]: RegistryItemTypeId,
};

export interface RegistryItem<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends FunctionSpec.FunctionSpec.AnyWithProps,
> {
  readonly [RegistryItemTypeId]: RegistryItemTypeId;
  readonly function_: Function;
  readonly handler: Handler<Schema, Function>;
}

export declare namespace RegistryItem {
  export interface AnyWithProps {
    readonly [RegistryItemTypeId]: RegistryItemTypeId;
    readonly function_: FunctionSpec.FunctionSpec.AnyWithProps;
    readonly handler: Handler.AnyWithProps;
  }
}

export const make = <
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Function extends FunctionSpec.FunctionSpec.AnyWithProps,
>({
  function_,
  handler,
}: {
  function_: Function;
  handler: Handler<Schema, Function>;
}): RegistryItem<Schema, Function> =>
  Object.assign(Object.create(RegistryItemProto), {
    function_,
    handler,
  });
