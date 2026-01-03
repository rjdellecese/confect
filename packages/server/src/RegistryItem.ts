import type { Effect } from "effect";
import { Predicate } from "effect";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as ActionCtx from "./ActionCtx";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import type * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import type * as MutationCtx from "./MutationCtx";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryCtx from "./QueryCtx";
import type * as QueryRunner from "./QueryRunner";
import type * as Scheduler from "./Scheduler";
import type {
  StorageActionWriter,
  StorageReader,
  StorageWriter,
} from "./Storage";
import type * as VectorSearch from "./VectorSearch";

// ============================================================================
// Type Definitions for Function Implementation Handlers
// ============================================================================

// TODO: Move to `Handler` module (or similar)

export type Handler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionType<FunctionSpec_, "Query">
    ? QueryHandler<DatabaseSchema_, FunctionSpec_>
    : FunctionSpec_ extends FunctionSpec.WithFunctionType<
          FunctionSpec_,
          "Mutation"
        >
      ? MutationHandler<DatabaseSchema_, FunctionSpec_>
      : FunctionSpec_ extends FunctionSpec.WithFunctionType<
            FunctionSpec_,
            "Action"
          >
        ? ActionHandler<DatabaseSchema_, FunctionSpec_>
        : never;

export type QueryHandler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  FunctionSpec_,
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | Auth.Auth
  | StorageReader
  | QueryRunner.QueryRunner
  | QueryCtx.QueryCtx<DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>>
>;

export type MutationHandler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  FunctionSpec_,
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | DatabaseWriter.DatabaseWriter<DatabaseSchema_>
  | Auth.Auth
  | Scheduler.Scheduler
  | StorageReader
  | StorageWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | MutationCtx.MutationCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >
>;

export type ActionHandler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  FunctionSpec_,
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader
  | StorageWriter
  | StorageActionWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | VectorSearch.VectorSearch<DataModel.FromSchema<DatabaseSchema_>>
  | ActionCtx.ActionCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >
>;

type BaseHandler<FunctionSpec_ extends FunctionSpec.AnyWithProps, R> = (
  args: FunctionSpec.Args<FunctionSpec_>["Type"],
) => Effect.Effect<FunctionSpec.Returns<FunctionSpec_>["Type"], never, R>;

export type HandlerAnyWithProps = Handler<
  DatabaseSchema.AnyWithProps,
  FunctionSpec.AnyWithProps
>;

export type HandlerWithName<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  FunctionName extends string,
> = Handler<
  DatabaseSchema_,
  FunctionSpec.WithName<FunctionSpec_, FunctionName>
>;

// ============================================================================
// RegistryItem - Registry Item
// ============================================================================

export const TypeId = "@rjdellecese/confect/server/RegistryItem";
export type TypeId = typeof TypeId;

export const isRegistryItem = (value: unknown): value is AnyWithProps =>
  Predicate.hasProperty(value, TypeId);

const RegistryItemProto = {
  [TypeId]: TypeId,
};

export interface RegistryItem<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  // TODO: Rename to `functionSpec`
  readonly function_: FunctionSpec_;
  readonly handler: Handler<DatabaseSchema_, FunctionSpec_>;
}

export interface AnyWithProps {
  readonly [TypeId]: TypeId;
  // TODO: Rename to `functionSpec`
  readonly function_: FunctionSpec.AnyWithProps;
  readonly handler: HandlerAnyWithProps;
}

export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
>({
  // TODO: Rename to `functionSpec`
  function_,
  handler,
}: {
  function_: FunctionSpec_;
  handler: Handler<DatabaseSchema_, FunctionSpec_>;
}): RegistryItem<DatabaseSchema_, FunctionSpec_> =>
  Object.assign(Object.create(RegistryItemProto), {
    function_,
    handler,
  });
