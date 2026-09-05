import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import type * as NodeServices from "@effect/platform-node/NodeServices";
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
import type * as StorageActionWriter from "./StorageActionWriter";
import type * as StorageReader from "./StorageReader";
import type * as StorageWriter from "./StorageWriter";
import type * as VectorSearch from "./VectorSearch";

export type Handler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  R = never,
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
      ? ConfectProvenanceHandler<DatabaseSchema_, FunctionSpec_, R>
      : never;

type ConvexProvenanceHandler<
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionProvenance<FunctionProvenance.AnyConvex>,
> = RegisteredFunction.ConvexRegisteredFunction<FunctionSpec_>;

type ConfectProvenanceHandler<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionProvenance<FunctionProvenance.AnyConfect>,
  R = never,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionType<FunctionSpec_, "query">
    ? ConfectProvenanceQuery<DatabaseSchema_, FunctionSpec_, R>
    : FunctionSpec_ extends FunctionSpec.WithFunctionType<
          FunctionSpec_,
          "mutation"
        >
      ? ConfectProvenanceMutation<DatabaseSchema_, FunctionSpec_, R>
      : FunctionSpec_ extends FunctionSpec.WithRuntimeAndFunctionType<
            FunctionSpec_,
            RuntimeAndFunctionType.ConvexAction
          >
        ? ConvexRuntimeAction<DatabaseSchema_, FunctionSpec_, R>
        : FunctionSpec_ extends FunctionSpec.WithRuntimeAndFunctionType<
              FunctionSpec_,
              RuntimeAndFunctionType.NodeAction
            >
          ? NodeRuntimeAction<DatabaseSchema_, FunctionSpec_, R>
          : never;

export type QueryServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | (DatabaseSchema_["target"]["kind"] extends "component" ? never : Auth.Auth)
  | StorageReader.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | QueryRunner.QueryRunner
  | QueryCtx.QueryCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>,
      DatabaseSchema.Scope<DatabaseSchema_>
    >;

export type MutationServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | DatabaseWriter.DatabaseWriter<DatabaseSchema_>
  | (DatabaseSchema_["target"]["kind"] extends "component" ? never : Auth.Auth)
  | Scheduler.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageReader.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageWriter.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | MutationCtx.MutationCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>,
      DatabaseSchema.Scope<DatabaseSchema_>
    >;

/** Shared by both action runtimes. */
export type ActionServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | Scheduler.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | (DatabaseSchema_["target"]["kind"] extends "component" ? never : Auth.Auth)
  | StorageReader.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageWriter.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageActionWriter.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | VectorSearch.VectorSearch<DataModel.FromSchema<DatabaseSchema_>>
  | ActionCtx.ActionCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>,
      DatabaseSchema.Scope<DatabaseSchema_>
    >;

export type ConfectProvenanceQuery<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyQuery>,
  R = never,
> = Base<FunctionSpec_, QueryServices<DatabaseSchema_> | R>;

export type ConfectProvenanceMutation<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyMutation>,
  R = never,
> = Base<FunctionSpec_, MutationServices<DatabaseSchema_> | R>;

export type ConvexRuntimeAction<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.AnyAction>,
  R = never,
> = Base<FunctionSpec_, ActionServices<DatabaseSchema_> | R>;

export type NodeRuntimeAction<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends
    FunctionSpec.AnyWithPropsWithFunctionType<RuntimeAndFunctionType.NodeAction>,
  R = never,
> = Base<
  FunctionSpec_,
  ActionServices<DatabaseSchema_> | NodeServices.NodeServices | R
>;

type Base<FunctionSpec_ extends FunctionSpec.AnyWithProps, R> = (
  args: FunctionSpec.Args<FunctionSpec_>,
) => Effect.Effect<
  FunctionSpec.Returns<FunctionSpec_>,
  FunctionSpec.Error<FunctionSpec_>,
  R
>;

export type Any = AnyConfectProvenance | AnyConvexProvenance;

export type AnyConfectProvenance = Base<FunctionSpec.AnyConfect, any>;

export type AnyConvexProvenance = RegisteredFunction.Any;

export type WithName<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  FunctionName extends string,
  R = never,
> = Handler<
  DatabaseSchema_,
  FunctionSpec.WithName<FunctionSpec_, FunctionName>,
  R
>;
