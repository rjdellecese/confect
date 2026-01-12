import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type { Effect } from "effect";
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

export type Handler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionType<FunctionSpec_, "Query">
    ? Query<DatabaseSchema_, FunctionSpec_>
    : FunctionSpec_ extends FunctionSpec.WithFunctionType<
          FunctionSpec_,
          "Mutation"
        >
      ? Mutation<DatabaseSchema_, FunctionSpec_>
      : FunctionSpec_ extends FunctionSpec.WithFunctionType<
            FunctionSpec_,
            "Action"
          >
        ? Action<DatabaseSchema_, FunctionSpec_>
        : never;

export type Query<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Query">,
> = Base<
  FunctionSpec_,
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | Auth.Auth
  | StorageReader
  | QueryRunner.QueryRunner
  | QueryCtx.QueryCtx<DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>>
>;

export type Mutation<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Mutation">,
> = Base<
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

export type Action<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithPropsWithFunctionType<"Action">,
> = Base<
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

type Base<FunctionSpec_ extends FunctionSpec.AnyWithProps, R> = (
  args: FunctionSpec.Args<FunctionSpec_>["Type"],
) => Effect.Effect<FunctionSpec.Returns<FunctionSpec_>["Type"], never, R>;

export type AnyWithProps = Handler<
  DatabaseSchema.AnyWithProps,
  FunctionSpec.AnyWithProps
>;

export type WithName<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  FunctionName extends string,
> = Handler<
  DatabaseSchema_,
  FunctionSpec.WithName<FunctionSpec_, FunctionName>
>;
