import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import type { NodeContext } from "@effect/platform-node";
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
import type * as RegisteredFunction from "./RegisteredFunction";
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
  FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
    FunctionSpec_,
    FunctionProvenance.AnyConvex
  >
    ? ConvexProvenanceHandler<FunctionSpec_>
    : FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
          FunctionSpec_,
          FunctionProvenance.AnyConfect
        >
      ? ConfectProvenanceHandler<DatabaseSchema_, FunctionSpec_>
      : never;

type ConvexProvenanceHandler<
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionProvenance<FunctionProvenance.AnyConvex>,
> = RegisteredFunction.ConvexRegisteredFunction<FunctionSpec_>;

type ConfectProvenanceHandler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionProvenance<FunctionProvenance.AnyConfect>,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionType<FunctionSpec_, "query">
    ? ConfectProvenanceQuery<DatabaseSchema_, FunctionSpec_>
    : FunctionSpec_ extends FunctionSpec.WithFunctionType<
          FunctionSpec_,
          "mutation"
        >
      ? ConfectProvenanceMutation<DatabaseSchema_, FunctionSpec_>
      : FunctionSpec_ extends FunctionSpec.WithRuntimeAndFunctionType<
            FunctionSpec_,
            RuntimeAndFunctionType.ConvexAction
          >
        ? ConvexRuntimeAction<DatabaseSchema_, FunctionSpec_>
        : FunctionSpec_ extends FunctionSpec.WithRuntimeAndFunctionType<
              FunctionSpec_,
              RuntimeAndFunctionType.NodeAction
            >
          ? NodeRuntimeAction<DatabaseSchema_, FunctionSpec_>
          : never;

export type ConfectProvenanceQuery<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyQuery>,
> = Base<
  FunctionSpec_,
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | Auth.Auth
  | StorageReader
  | QueryRunner.QueryRunner
  | QueryCtx.QueryCtx<DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>>
>;

export type ConfectProvenanceMutation<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyMutation>,
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

type ActionServices<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
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
    >;

export type ConvexRuntimeAction<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyAction>,
> = Base<FunctionSpec_, ActionServices<DatabaseSchema_>>;

export type NodeRuntimeAction<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.NodeAction>,
> = Base<
  FunctionSpec_,
  ActionServices<DatabaseSchema_> | NodeContext.NodeContext
>;

type Base<FunctionSpec_ extends FunctionSpec.AnyWithProps, R> = (
  args: FunctionSpec.Args<FunctionSpec_>,
) => Effect.Effect<FunctionSpec.Returns<FunctionSpec_>, never, R>;

export type Any = AnyConfectProvenance | AnyConvexProvenance;

export type AnyConfectProvenance = Base<FunctionSpec.AnyConfect, any>;

export type AnyConvexProvenance = RegisteredFunction.Any;

export type WithName<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  FunctionName extends string,
> = Handler<
  DatabaseSchema_,
  FunctionSpec.WithName<FunctionSpec_, FunctionName>
>;
